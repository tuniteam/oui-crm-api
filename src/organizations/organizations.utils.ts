// ============================================
// OUI-CRM - Organizations utils: pure rules + reusable Prisma fragments
// ============================================

import { CustomerStatus, Organization, Prisma, PrismaClient, Priority, RelationshipStatus, SalesStatus } from '@prisma/client';
import { apiError } from '@/common/api-error';
import { PopulationBracket } from '@/pricing/pricing.types';
import { loadActiveGridContent } from '@/pricing/pricing.utils';
import { resolveDepartments } from '@/scopes/geo.constants';
import { ScopeContext, ScopeService } from '@/scopes/scope.service';
import { hydrateCampaignMembership } from '@/scopes/scopes.utils';
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
      name: { equals: name.trim(), mode: 'insensitive' },
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
 * The one definition of "search an organization by text" (US-01-01 list AND US-01-12 global
 * search — closure review L1): name, city, and SIRET when the input is numeric.
 */
export function organizationSearchOr(rawSearch: string): Prisma.OrganizationWhereInput[] {
  const search = rawSearch.trim();
  const digits = search.replace(/\s/g, '');
  const or: Prisma.OrganizationWhereInput[] = [
    { name: { contains: search, mode: 'insensitive' } },
    { city: { contains: search, mode: 'insensitive' } },
  ];
  // A SIRET is 14 digits: only a numeric input can match one.
  if (/^[0-9]+$/.test(digits)) or.push({ siret: { startsWith: digits } });
  return or;
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
    and.push({ OR: organizationSearchOr(filters.search) });
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

// ---- payload validators (US-01-02/03 — promised by the handoff, enforced here) -----------

type ValidatorDb = Pick<PrismaClient, 'referenceItem' | 'userRoleProject'> | Prisma.TransactionClient;

/** Reference-list fields of the payload → their ReferenceItem category (SPEC-13 §2.3). */
const REFERENCE_FIELD_CATEGORIES = {
  type: 'STRUCTURE_TYPE',
  solution: 'SOLUTION',
  leadSource: 'LEAD_SOURCE',
  lossReason: 'LOSS_REASON',
} as const;
const REFERENCE_ARRAY_CATEGORIES = { tags: 'TAG', services: 'SERVICE' } as const;

/** Champs pointant vers une liste administrable : la table ci-dessus dit laquelle. */
export interface ReferenceInput {
  type?: string | null;
  solution?: string | null;
  leadSource?: string | null;
  /** Motif de perte d'une opportunité (US-02-09) — même validation, autre catégorie. */
  lossReason?: string | null;
  tags?: string[] | null;
  services?: string[] | null;
}

/** Every reference key must exist in the project's lists → 400 INVALID_REFERENCE_VALUE. */
export async function assertReferencesKnown(db: ValidatorDb, projectId: string, input: ReferenceInput): Promise<void> {
  const checks: { category: string; key: string }[] = [];
  for (const [field, category] of Object.entries(REFERENCE_FIELD_CATEGORIES)) {
    const key = input[field as keyof ReferenceInput] as string | null | undefined;
    if (key) checks.push({ category, key });
  }
  for (const [field, category] of Object.entries(REFERENCE_ARRAY_CATEGORIES)) {
    for (const key of (input[field as keyof ReferenceInput] as string[] | null | undefined) ?? []) checks.push({ category, key });
  }
  if (!checks.length) return;
  const rows = await db.referenceItem.findMany({
    where: { projectId, OR: checks.map((c) => ({ category: c.category, key: c.key })) },
    select: { category: true, key: true },
  });
  const known = new Set(rows.map((r) => `${r.category}:${r.key}`));
  const unknown = checks.find((c) => !known.has(`${c.category}:${c.key}`));
  if (unknown) throw apiError.badRequest('INVALID_REFERENCE_VALUE', unknown.category, unknown.key);
}

export interface AssigneeInput {
  salesRepId?: string | null;
  consultantId?: string | null;
  trainerId?: string | null;
}

/** salesRep / consultant / trainer must be ACTIVE members of the project → 404 USER_NOT_FOUND. */
export async function assertAssigneesAreMembers(db: ValidatorDb, projectId: string, input: AssigneeInput): Promise<void> {
  const ids = [...new Set([input.salesRepId, input.consultantId, input.trainerId].filter((id): id is string => !!id))];
  if (!ids.length) return;
  const members = await db.userRoleProject.findMany({
    where: { projectId, userId: { in: ids }, status: RelationshipStatus.ACTIVE },
    select: { userId: true },
  });
  const active = new Set(members.map((m) => m.userId));
  if (ids.some((id) => !active.has(id))) throw apiError.notFound('USER_NOT_FOUND');
}

/**
 * Writing (and reading the details) of a record requires FULL access. The status differs on
 * purpose: a NONE caller must not learn that the record exists (404), while a RESTRICTED
 * caller already sees it in its list and deserves a real answer (403). Shared with contacts.
 */
export async function assertFullOrganizationAccess(
  db: Db,
  scopeService: ScopeService,
  ctx: ScopeContext,
  organization: Organization,
  id: string,
): Promise<void> {
  // Campaign-scoped contexts judge membership the row does not carry (closure review L1)
  const scoped = organization as Organization & { campaignIds?: string[] };
  await hydrateCampaignMembership(db as never, ctx, [scoped]);
  const access = scopeService.access(ctx, scoped);
  if (access === 'FULL') return;
  if (access === 'RESTRICTED') throw apiError.forbidden('ACCESS_DENIED');
  throw apiError.notFound('ORGANIZATION_NOT_FOUND', id);
}

/**
 * The single writer of Organization.salesStatus (activities automatisms now, kanban in
 * phase E): both paths converge here so the transition stays observable and idempotent.
 * Returns the change, or null when the status already holds.
 */
export async function applySalesStatus(
  tx: Prisma.TransactionClient,
  organization: Pick<Organization, 'id' | 'salesStatus'>,
  to: SalesStatus,
): Promise<{ from: SalesStatus; to: SalesStatus } | null> {
  if (organization.salesStatus === to) return null;
  await tx.organization.update({ where: { id: organization.id }, data: { salesStatus: to } });
  return { from: organization.salesStatus, to };
}

/** Brackets of the project's ACTIVE grid; empty when no grid is active. The bracket rule
 *  itself belongs to the pricing engine (`@/pricing/pricing.utils`, SPEC-04 §3 règle 1). */
export async function loadActiveBrackets(
  db: Pick<PrismaClient, 'pricingGrid'>,
  projectId: string,
): Promise<PopulationBracket[]> {
  return (await loadActiveGridContent(db, projectId))?.brackets ?? [];
}
