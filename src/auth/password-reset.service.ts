import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User, UserStatus } from '@prisma/client';
import * as Cryptr from 'cryptr';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { apiError } from '@/common/api-error';
import { normalizeEmail } from '@/common/utils/email.utils';
import { fullName } from '@/common/utils/user.utils';
import { MailService } from '@/mail/mail.service';
import { PrismaService } from '@/prisma/prisma.service';
import { AUTH_AUDIT, TOKEN_FLOWS } from './auth.constants';
import { assertAndHashPassword } from './utils/password.utils';
import {
  buildFrontLink,
  createCryptr,
  issueToken,
  resolveToken,
  storeIssuedToken,
} from './utils/secure-token.utils';

const FLOW = TOKEN_FLOWS.passwordReset;
const isActive = (user: User) => user.status === UserStatus.ACTIVE;

/**
 * US-00-02 — password reset: e-mailed token (30 min), ACTIVE users only. The request route
 * never reveals whether the e-mail exists.
 */
@Injectable()
export class PasswordResetService {
  private readonly cryptr: Cryptr;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly audit: AuditLogService,
    @Inject(FLOW.diToken) private readonly jwtService: JwtService,
  ) {
    this.cryptr = createCryptr(config, FLOW);
  }

  async request(email: string): Promise<{ sent: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    if (!user || !isActive(user)) return { sent: false };

    const issued = await issueToken(this.jwtService, this.cryptr, { userId: user.id });
    await storeIssuedToken(this.prisma, this.prisma.passwordResetToken, user.id, issued);
    const sent = await this.mail.sendPasswordResetEmail({
      to: user.email,
      fullName: fullName(user),
      resetLink: buildFrontLink(this.config, FLOW, issued.encrypted),
      expiresAt: issued.expiresAt,
    });
    return { sent };
  }

  async validate(token: string): Promise<void> {
    await this.resolveUser(token);
  }

  /** Sets the password and closes every session of the user. */
  async complete(token: string, password: string): Promise<void> {
    const user = await this.resolveUser(token);
    const hashed = await assertAndHashPassword(this.config, password);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { password: hashed, passwordChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
      });
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await this.audit.log(tx, {
        projectId: null,
        userId: user.id,
        action: AUTH_AUDIT.PASSWORD_RESET,
        objectType: AUDIT_OBJECTS.USER,
        objectId: user.id,
      });
    });
  }

  // ----------------------------------------------------------------------------------------

  /** Token → ACTIVE user, or 400 PASSWORD_RESET_TOKEN_INVALID / 410 PASSWORD_RESET_TOKEN_EXPIRED. */
  private async resolveUser(token: string): Promise<User> {
    const { verdict, user } = await resolveToken({
      prisma: this.prisma,
      jwtService: this.jwtService,
      cryptr: this.cryptr,
      delegate: this.prisma.passwordResetToken,
      token,
      isEligible: isActive,
    });
    if (verdict === 'EXPIRED') throw apiError.gone('PASSWORD_RESET_TOKEN_EXPIRED');
    if (verdict !== 'VALID' || !user) throw apiError.badRequest('PASSWORD_RESET_TOKEN_INVALID');
    return user;
  }
}
