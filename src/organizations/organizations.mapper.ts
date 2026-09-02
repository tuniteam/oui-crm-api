// ============================================
// OUI-CRM - Organizations mapping: entity -> response DTOs
// The RESTRICTED projection lives here and nowhere else: adding a column to the detail must
// never leak it to an out-of-scope caller (SPEC-07 US-01-01).
// ============================================

import { Prisma } from '@prisma/client';
import { fullName } from '@/common/utils/user.utils';
import { formatDateField } from '@/common/utils/date.utils';
import { regionOfDepartment } from '@/scopes/geo.constants';
import { ScopeAccess } from '@/scopes/scope.service';
import {
  CompletenessDetailDto,
  OrganizationCountsDto,
  OrganizationDetailDto,
  OrganizationListItemDto,
  UserRefDto,
} from './dto/response-organization.dto';

/** Owners are joined so the list can show them without a second round-trip. */
export const ORGANIZATION_REFS = {
  salesRep: { select: { id: true, firstName: true, lastName: true } },
  consultant: { select: { id: true, firstName: true, lastName: true } },
  trainer: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.OrganizationInclude;

export type OrganizationWithRefs = Prisma.OrganizationGetPayload<{ include: typeof ORGANIZATION_REFS }>;

type UserRow = { id: string; firstName: string; lastName: string } | null;

function toUserRef(user: UserRow): UserRefDto | null {
  return user ? { id: user.id, fullName: fullName(user) } : null;
}

/**
 * List row. With `access: 'RESTRICTED'` the payload stops at the eight allowed columns —
 * the caller is outside their scope and must not see anything else.
 */
export function mapToListItem(
  organization: OrganizationWithRefs,
  access: ScopeAccess,
  missing: string[] = [],
): OrganizationListItemDto {
  const base = {
    id: organization.id,
    name: organization.name,
    type: organization.type,
    city: organization.city,
    department: organization.department,
    salesStatus: organization.salesStatus,
    customerStatus: organization.customerStatus,
    salesRep: toUserRef(organization.salesRep),
    access: access === 'RESTRICTED' ? ('RESTRICTED' as const) : ('FULL' as const),
  };
  if (access === 'RESTRICTED') return base;

  return {
    ...base,
    population: organization.population,
    priority: organization.priority,
    tags: organization.tags,
    solution: organization.solution ? { key: organization.solution } : null,
    lastActivityAt: organization.lastActivityAt?.toISOString() ?? null,
    nextActivityAt: organization.nextActivityAt?.toISOString() ?? null,
    completeness: { score: organization.completenessScore, missing },
  };
}

/** Full record: everything the list carries, plus the columns only the drawer needs. */
export function mapToDetail(
  organization: OrganizationWithRefs,
  extra: { completeness: CompletenessDetailDto; counts: OrganizationCountsDto },
): OrganizationDetailDto {
  return {
    ...mapToListItem(organization, 'FULL'),
    displayPrefix: organization.displayPrefix,
    siret: organization.siret,
    siren: organization.siren,
    inseeCode: organization.inseeCode,
    address: organization.address,
    postalCode: organization.postalCode,
    region: regionOfDepartment(organization.department),
    epci: organization.epci,
    phone: organization.phone,
    email: organization.email,
    website: organization.website,
    schoolCount: organization.schoolCount,
    childCount: organization.childCount,
    services: organization.services.map((key) => ({ key })),
    leadSource: organization.leadSource ? { key: organization.leadSource } : null,
    targetPlan: organization.targetPlan,
    consultant: toUserRef(organization.consultant),
    trainer: toUserRef(organization.trainer),
    notes: organization.notes,
    goLiveTarget: organization.goLiveTarget ? formatDateField(organization.goLiveTarget) : null,
    completeness: extra.completeness,
    counts: extra.counts,
    createdAt: organization.createdAt.toISOString(),
    updatedAt: organization.updatedAt.toISOString(),
  };
}
