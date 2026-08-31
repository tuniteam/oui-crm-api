import { Prisma } from '@prisma/client';
import { applyOverrides, isRelationActive } from '@/auth/utils/permissions.util';
import { ContactType } from '@/common/enums/contact.enum';
import { LEGAL_DOCUMENTS } from '@/common/legal/legal.constants';
import { computeOutdatedLegalDocuments } from '@/common/legal/legal.utils';
import {
  LegalDocumentToAcceptDto,
  MeResponseDto,
  MeRoleRelationshipDto,
} from './dto/me-response.dto';

/** Everything GET /profile/me needs, in one query (same access rules as JwtStrategy). */
export const userWithAccess = Prisma.validator<Prisma.UserDefaultArgs>()({
  include: {
    userRoleProjects: {
      orderBy: { displayOrder: 'asc' },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
        project: { include: { features: { where: { enabled: true } } } },
        scope: true,
      },
    },
    overrides: { include: { permission: true } },
  },
});
export type UserWithAccess = Prisma.UserGetPayload<typeof userWithAccess>;
type RelationLoaded = UserWithAccess['userRoleProjects'][number];

function mapRelation(urp: RelationLoaded, overrides: UserWithAccess['overrides']): MeRoleRelationshipDto {
  const projectOverrides = overrides
    .filter((o) => o.projectId === urp.projectId)
    .map((o) => ({ code: o.permission.code, granted: o.granted }));

  return {
    roleCode: urp.role.code,
    projectId: urp.projectId,
    projectName: urp.project?.name ?? null,
    projectSlug: urp.project?.slug ?? null,
    displayOrder: urp.displayOrder,
    outOfScopeAccess: urp.role.outOfScopeAccess,
    permissions: applyOverrides(
      urp.role.permissions.map((rp) => ({ code: rp.permission.code, scope: rp.scope })),
      projectOverrides,
    ),
    modules: urp.project?.features.map((f) => f.feature) ?? [],
    scope: urp.scope
      ? {
          name: urp.scope.name,
          regions: urp.scope.regions,
          departments: urp.scope.departments,
          portfolioOnly: urp.scope.portfolioOnly,
        }
      : null,
    expiresAt: urp.expiresAt,
  };
}

/**
 * SPEC-06 §6: active non-expired relations, permissions corrected by overrides,
 * backoffice users never gated by the legal documents.
 */
export function mapToMeResponse(user: UserWithAccess, avatarUrl: string | null): MeResponseDto {
  const now = new Date();
  const relations = user.userRoleProjects
    .filter((urp) => isRelationActive(urp, now))
    .map((urp) => mapRelation(urp, user.overrides));

  const isBackoffice = user.userRoleProjects.some((urp) => urp.role.isBackoffice);
  const outdated = isBackoffice ? [] : computeOutdatedLegalDocuments(user);
  const legalDocumentsToAccept: LegalDocumentToAcceptDto[] = outdated.map((code) => ({
    code,
    version: LEGAL_DOCUMENTS[code].version,
    url: LEGAL_DOCUMENTS[code].url,
  }));

  return {
    contactId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    initials: user.userRoleProjects.find((urp) => isRelationActive(urp, now))?.initials ?? null,
    avatarUrl,
    contactType: isBackoffice ? ContactType.BACKOFFICE : ContactType.PROJECT,
    roleRelationships: relations,
    legalReacceptanceRequired: legalDocumentsToAccept.length > 0,
    legalDocumentsToAccept,
  };
}
