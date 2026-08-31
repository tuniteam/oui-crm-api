import { Prisma } from '@prisma/client';
import { effectivePermissions, isRelationActive } from '@/auth/utils/permissions.util';
import { ContactType } from '@/common/enums/contact.enum';
import { LegalDocumentDto } from '@/common/legal/legal.dto';
import { computeOutdatedLegalDocuments, listLegalDocuments } from '@/common/legal/legal.utils';
import { MeResponseDto, MeRoleRelationshipDto } from './dto/me-response.dto';

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
  return {
    roleCode: urp.role.code,
    projectId: urp.projectId,
    projectName: urp.project?.name ?? null,
    projectSlug: urp.project?.slug ?? null,
    displayOrder: urp.displayOrder,
    outOfScopeAccess: urp.role.outOfScopeAccess,
    permissions: effectivePermissions(urp, overrides),
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
  // Only ACTIVE, non-expired relations count — including for the backoffice legal exemption
  const activeRelations = user.userRoleProjects.filter((urp) => isRelationActive(urp, now));
  const relations = activeRelations.map((urp) => mapRelation(urp, user.overrides));

  const isBackoffice = activeRelations.some((urp) => urp.role.isBackoffice);
  const outdated = isBackoffice ? [] : computeOutdatedLegalDocuments(user);
  const legalDocumentsToAccept: LegalDocumentDto[] = listLegalDocuments().filter((d) =>
    outdated.includes(d.code),
  );

  return {
    contactId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    initials: activeRelations[0]?.initials ?? null,
    avatarUrl,
    contactType: isBackoffice ? ContactType.BACKOFFICE : ContactType.PROJECT,
    roleRelationships: relations,
    legalReacceptanceRequired: legalDocumentsToAccept.length > 0,
    legalDocumentsToAccept,
  };
}
