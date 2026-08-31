import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Prisma } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ApiMessages } from '@/common/messages';
import { PrismaService } from '@/prisma/prisma.service';
import { AUTH_ENV } from '../auth.constants';
import { AuthenticatedRelation, AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { effectivePermissions, isRelationActive } from '../utils/permissions.util';
import { assertSessionLive } from '../utils/session.utils';

/** Everything the principal needs, loaded once per request from the session. */
const sessionWithPrincipal = Prisma.validator<Prisma.SessionDefaultArgs>()({
  include: {
    user: {
      include: {
        userRoleProjects: {
          orderBy: { displayOrder: 'asc' },
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
            project: { include: { features: { where: { enabled: true } } } },
          },
        },
        overrides: { include: { permission: true } },
      },
    },
  },
});
type SessionWithPrincipal = Prisma.SessionGetPayload<typeof sessionWithPrincipal>;
type UserRoleProjectLoaded = SessionWithPrincipal['user']['userRoleProjects'][number];
type OverrideLoaded = SessionWithPrincipal['user']['overrides'][number];

/**
 * One UserRoleProject row → one relation of the principal, with effective permissions
 * (role grants corrected by the user's overrides for that project — SPEC-06 §2).
 */
export function toAuthenticatedRelation(
  urp: UserRoleProjectLoaded,
  overrides: OverrideLoaded[],
): AuthenticatedRelation {
  return {
    roleId: urp.roleId,
    roleCode: urp.role.code,
    isBackoffice: urp.role.isBackoffice,
    outOfScopeAccess: urp.role.outOfScopeAccess,
    projectId: urp.projectId,
    projectName: urp.project?.name ?? null,
    projectSlug: urp.project?.slug ?? null,
    scopeId: urp.scopeId,
    initials: urp.initials,
    expiresAt: urp.expiresAt,
    permissions: effectivePermissions(urp, overrides),
    features: urp.project?.features.map((f) => f.feature) ?? [],
  };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const secret = config.get<string>(AUTH_ENV.JWT_ACCESS_SECRET);
    if (!secret) throw new Error(ApiMessages.errors.message.JWT_ACCESS_SECRET_MISSING);
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * The session is reloaded on every request (SPEC-02 §4.1): a rotated version, an expired
   * session or a user that is no longer ACTIVE invalidates the access token immediately.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
      ...sessionWithPrincipal,
    });
    assertSessionLive(session, payload.version);

    const user = session.user;
    const now = new Date();
    const relations = user.userRoleProjects
      .filter((urp) => isRelationActive(urp, now))
      .map((urp) => toAuthenticatedRelation(urp, user.overrides));

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      sessionId: session.id,
      relations,
    };
  }
}
