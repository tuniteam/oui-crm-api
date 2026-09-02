// ============================================
// OUI-CRM - Organizations utils: pure rules + reusable Prisma fragments
// ============================================

import { CustomerStatus, Organization, Prisma, PrismaClient, Priority, SalesStatus } from '@prisma/client';
import { apiError } from '@/common/api-error';
import { resolveDepartments } from '@/scopes/geo.constants';
import {
  COMPLETENESS_FIELDS,
  CONTRACT_BLOCKING_FIELDS,
  CompletenessField,
  DEFAULT_ORGANIZATION_SORT,
  DUPLICATE_CHECK_LIMIT,
  OrganizationSortField,
  QUOTE_BLOCKING_FIELDS,
} from './organizations.constants';

type Db = PrismaClient | Prisma.TransactionClient;

// ---------------------------------------------------------------------------- completeness

/** The organization columns the completeness rule reads, plus its primary-contact flag. */
export interface CompletenessInput {
  siret: string | null;
  address: string | null;
  postalCode: string | null;
  population: number | null;
  email: string | null;
  hasPrimaryContact: boolean;
}

export interface Completeness {
  score: number;
  missing: CompletenessField[];
  blocks: { quote: boolean; contract: boolean };
}

/** Which criteria are satisfied — the single definition, reused by the score and the detail. */
function filled(input: CompletenessInput): Record<CompletenessField, boolean> {
  return {
    SIRET: Boolean(input.siret),
    ADDRESS: Boolean(input.address),
    POSTAL_CODE: Boolean(input.postalCode),
    POPULATION: input.population !== null && input.population !== undefined,
    PRIMARY_CONTACT: input.hasPrimaryContact,
    EMAIL: Boolean(input.email),
  };
}

/** Percentage of satisfied criteria, rounded — 0 to 100. */
export function completenessScore(input: CompletenessInput): number {
  const values = filled(input);
  const ok = COMPLETENESS_FIELDS.filter((f) => values[f]).length;
  return Math.round((ok / COMPLETENESS_FIELDS.length) * 100);
}

export function computeCompleteness(input: CompletenessInput): Completeness {
  const values = filled(input);
  const missing = COMPLETENESS_FIELDS.filter((f) => !values[f]);
  return {
    score: completenessScore(input),
    missing,
    blocks: {
      quote: QUOTE_BLOCKING_FIELDS.some((f) => missing.includes(f)),
      contract: CONTRACT_BLOCKING_FIELDS.some((f) => missing.includes(f)),
    },
  };
}

/**
 * Recomputes and stores `completenessScore`. Called by every write path that can change a
 * criterion: organization create/update AND contact create/update/delete (the primary-contact
 * criterion lives in another table) AND the import. Never duplicate the formula elsewhere.
 */
export async function recomputeCompleteness(db: Db, organizationId: string): Promise<number> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      siret: true,
      address: true,
      postalCode: true,
      population: true,
      email: true,
      contacts: { where: { isPrimary: true, deletedAt: null }, select: { id: true }, take: 1 },
    },
  });
  if (!org) return 0;

  const score = completenessScore({ ...org, hasPrimaryContact: org.contacts.length > 0 });
  await db.organization.update({ where: { id: organizationId }, data: { completenessScore: score } });
  return score;
}

// ---------------------------------------------------------------------------- lookups

/** Active record of the current project, or 404. Never `findUnique`: projectId must be in the where. */
export async function getOrganizationOrThrow(
  db: Db,
  id: string,
  projectId: string,
): Promise<Organization> {
  const organization = await db.organization.findFirst({ where: { id, projectId, deletedAt: null } });
  if (!organization) throw apiError.notFound('ORGANIZATION_NOT_FOUND', id);
  return organization;
}

/** SIRET and INSEE code are unique per project among active records (partial unique indexes). */
export async function assertIdentifiersAvailable(
  db: Db,
  projectId: string,
  identifiers: { siret?: string | null; inseeCode?: string | null },
  excludeId?: string,
): Promise<void> {
  const base = { projectId, deletedAt: null, ...(excludeId && { id: { not: excludeId } }) };

  if (identifiers.siret) {
    const clash = await db.organization.findFirst({ where: { ...base, siret: identifiers.siret } });
    if (clash) throw apiError.conflict('ORGANIZATION_SIRET_EXISTS');
  }
  if (identifiers.inseeCode) {
    const clash = await db.organization.findFirst({ where: { ...base, inseeCode: identifiers.inseeCode } });
    if (clash) throw apiError.conflict('ORGANIZATION_INSEE_CODE_EXISTS');
  }
}

/**
 * Same name at the same postal code: a warning, not a rule — the caller may confirm with
 * `force: true` (US-01-02). Returns the candidates so the front can show them.
 */
export async function findPossibleDuplicates(
  db: Db,
  projectId: string,
  name: string,
  postalCode?: string | null,
): Promise<{ id: string; name: string; city: string | null }[]> {
  if (!postalCode) return [];
  return db.organization.findMany({
    where: {
      projectId,
      deletedAt: null,
      postalCode,
      name: { equals: name, mode: 'insensitive' },
    },
    select: { id: true, name: true, city: true },
    take: DUPLICATE_CHECK_LIMIT,
  });
}

// ---------------------------------------------------------------------------- list query

export interface OrganizationFilters {
  search?: string;
  type?: string;
  department?: string;
  region?: string;
  salesStatus?: SalesStatus;
  customerStatus?: CustomerStatus;
  priority?: Priority;
  tag?: string;
  solution?: string;
  salesRepId?: string;
  leadSource?: string;
  completenessMax?: number;
}

/**
 * Filters of the list, ANDed with the scope fragment by the service. The search covers name,
 * city and SIRET — trigram indexes back the first two (US-01-01).
 */
export function buildOrganizationWhere(
  projectId: string,
  filters: OrganizationFilters,
): Prisma.OrganizationWhereInput {
  const where: Prisma.OrganizationWhereInput = { projectId, deletedAt: null };
  const and: Prisma.OrganizationWhereInput[] = [];

  if (filters.search) {
    const search = filters.search.trim();
    const digits = search.replace(/\s/g, '');
    const or: Prisma.OrganizationWhereInput[] = [
      { name: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
    ];
    // A SIRET is 14 digits: only a numeric input can match one.
    if (/^[0-9]+$/.test(digits)) or.push({ siret: { startsWith: digits } });
    and.push({ OR: or });
  }

  // A region is a set of departments: pushed down to SQL, never filtered in memory.
  if (filters.region) {
    const departments = resolveDepartments([filters.region], []);
    and.push({ department: { in: departments.length ? departments : ['__none__'] } });
  }
  if (filters.department) and.push({ department: filters.department });
  if (filters.type) and.push({ type: filters.type });
  if (filters.solution) and.push({ solution: filters.solution });
  if (filters.leadSource) and.push({ leadSource: filters.leadSource });
  if (filters.tag) and.push({ tags: { has: filters.tag } });
  if (filters.salesRepId) and.push({ salesRepId: filters.salesRepId });
  if (filters.salesStatus) and.push({ salesStatus: filters.salesStatus });
  if (filters.customerStatus) and.push({ customerStatus: filters.customerStatus });
  if (filters.priority) and.push({ priority: filters.priority });
  if (filters.completenessMax !== undefined) {
    and.push({ completenessScore: { lte: filters.completenessMax } });
  }

  if (and.length) where.AND = and;
  return where;
}

/** Sortable columns that accept NULL — they must never come first, whatever the direction. */
const NULLABLE_SORT_FIELDS: OrganizationSortField[] = [
  'city',
  'population',
  'lastActivityAt',
  'nextActivityAt',
];

/**
 * Postgres places NULLs first on a DESC sort: sorting by population descending would open
 * with the records that have no population at all. Empty values always go last instead.
 */
export function buildOrganizationOrderBy(
  sort: OrganizationSortField = DEFAULT_ORGANIZATION_SORT,
  order: 'asc' | 'desc' = 'asc',
): Prisma.OrganizationOrderByWithRelationInput {
  if (NULLABLE_SORT_FIELDS.includes(sort)) return { [sort]: { sort: order, nulls: 'last' } };
  return { [sort]: order };
}
