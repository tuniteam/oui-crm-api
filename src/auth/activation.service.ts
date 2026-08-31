import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User, UserStatus } from '@prisma/client';
import * as Cryptr from 'cryptr';
import { apiError } from '@/common/api-error';
import { LegalDocument } from '@/common/legal/legal.constants';
import { listLegalDocuments, stampConsents } from '@/common/legal/legal.utils';
import { getNumber } from '@/common/utils/config.utils';
import { fullName } from '@/common/utils/user.utils';
import { MailService } from '@/mail/mail.service';
import { PrismaService } from '@/prisma/prisma.service';
import { AUTH_ENV, DEFAULT_BCRYPT_ROUNDS, TOKEN_FLOWS } from './auth.constants';
import { AuthService } from './auth.service';
import { ActivationCompleteDto } from './dto/activation-complete.dto';
import { ActivationValidateResponseDto } from './dto/activation-validate.dto';
import { AuthTokensResponseDto } from './dto/auth-tokens-response.dto';
import { assertPasswordStrength, hashPassword } from './utils/password.utils';
import {
  buildFrontLink,
  createCryptr,
  issueToken,
  resolveToken,
  storeIssuedToken,
} from './utils/secure-token.utils';

const FLOW = TOKEN_FLOWS.activation;
const isPending = (user: User) => user.status === UserStatus.PENDING;

/**
 * US-00-02 — account activation: the e-mailed token (72 h) lets a PENDING user choose a
 * password and accept the legal documents; the account becomes ACTIVE and a session opens.
 */
@Injectable()
export class ActivationService {
  private readonly logger = new Logger(ActivationService.name);
  private readonly cryptr: Cryptr;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly authService: AuthService,
    @Inject(FLOW.diToken) private readonly jwtService: JwtService,
  ) {
    this.cryptr = createCryptr(config, FLOW);
  }

  /** Issues a fresh token (replacing any previous one) and e-mails it. PENDING users only. */
  async sendActivationToken(userId: string): Promise<{ sent: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !isPending(user)) return { sent: false };
    return { sent: await this.issueAndSend(user) };
  }

  async validate(token: string): Promise<ActivationValidateResponseDto> {
    const user = await this.resolveUser(token);
    return {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      legalDocuments: listLegalDocuments(),
    };
  }

  async complete(dto: ActivationCompleteDto): Promise<AuthTokensResponseDto> {
    if (dto.acceptCgu !== true || dto.acceptRgpd !== true) throw apiError.badRequest('LEGAL_CONSENT_REQUIRED');
    assertPasswordStrength(dto.password);

    const user = await this.resolveUser(dto.token);
    const password = await hashPassword(
      dto.password,
      getNumber(this.config, AUTH_ENV.BCRYPT_ROUNDS, DEFAULT_BCRYPT_ROUNDS),
    );
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { password, status: UserStatus.ACTIVE, passwordChangedAt: now },
      });
      await stampConsents(tx, user.id, [LegalDocument.CGU, LegalDocument.RGPD], now);
      await tx.activationToken.deleteMany({ where: { userId: user.id } });
    });

    return this.authService.openSession(user.id);
  }

  // ----------------------------------------------------------------------------------------

  /**
   * Token → PENDING user, or 400 ACTIVATION_TOKEN_INVALID / 410 ACTIVATION_TOKEN_EXPIRED.
   * An expired token triggers a new e-mail (best effort) so the user can retry.
   */
  private async resolveUser(token: string): Promise<User> {
    const { verdict, user } = await resolveToken({
      prisma: this.prisma,
      jwtService: this.jwtService,
      cryptr: this.cryptr,
      delegate: this.prisma.activationToken,
      token,
      isEligible: isPending,
    });
    if (verdict === 'EXPIRED' && user) {
      this.issueAndSend(user).catch((err: Error) =>
        this.logger.error(`Activation re-send failed for ${user.id}: ${err.message}`),
      );
      throw apiError.gone('ACTIVATION_TOKEN_EXPIRED');
    }
    if (verdict !== 'VALID' || !user) throw apiError.badRequest('ACTIVATION_TOKEN_INVALID');
    return user;
  }

  private async issueAndSend(user: User): Promise<boolean> {
    const issued = await issueToken(this.jwtService, this.cryptr, { userId: user.id });
    await storeIssuedToken(this.prisma, this.prisma.activationToken, user.id, issued);
    return this.mail.sendActivationEmail({
      to: user.email,
      fullName: fullName(user),
      activationLink: buildFrontLink(this.config, FLOW, issued.encrypted),
      expiresAt: issued.expiresAt,
    });
  }
}
