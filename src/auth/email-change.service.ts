import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as Cryptr from 'cryptr';
import { apiError } from '@/common/api-error';
import { assertEmailAvailable, normalizeEmail } from '@/common/utils/email.utils';
import { fullName } from '@/common/utils/user.utils';
import { MailService } from '@/mail/mail.service';
import { PrismaService } from '@/prisma/prisma.service';
import { TOKEN_FLOWS } from './auth.constants';
import { EmailChangeConfirmResponseDto } from './dto/email-change-confirm.dto';
import { EmailChangeRequestDto } from './dto/email-change-request.dto';
import {
  buildFrontLink,
  createCryptr,
  issueToken,
  resolveToken,
  storeIssuedToken,
} from './utils/secure-token.utils';

const FLOW = TOKEN_FLOWS.emailChange;
const anyUser = (_user: User) => true;

/**
 * US-00-02 — self-service e-mail change: password re-check, confirmation link sent to the
 * new address (30 min), change applied on confirmation, every session closed.
 */
@Injectable()
export class EmailChangeService {
  private readonly logger = new Logger(EmailChangeService.name);
  private readonly cryptr: Cryptr;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    @Inject(FLOW.diToken) private readonly jwtService: JwtService,
  ) {
    this.cryptr = createCryptr(config, FLOW);
  }

  async request(userId: string, dto: EmailChangeRequestDto): Promise<void> {
    const newEmail = normalizeEmail(dto.newEmail);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw apiError.notFound('USER_NOT_FOUND');
    if (user.status !== UserStatus.ACTIVE) throw apiError.forbidden('USER_INACTIVE');
    if (!(await bcrypt.compare(dto.currentPassword, user.password))) {
      throw apiError.unauthorized('AUTH_INVALID_CREDENTIALS');
    }
    if (newEmail === normalizeEmail(user.email)) throw apiError.badRequest('EMAIL_UNCHANGED');
    await assertEmailAvailable(this.prisma, newEmail, userId);

    const issued = await issueToken(this.jwtService, this.cryptr, { userId });
    await storeIssuedToken(this.prisma, this.prisma.emailChangeToken, userId, issued, { newEmail });
    await this.mail.sendEmailChangeConfirmEmail({
      to: newEmail,
      fullName: fullName(user),
      confirmLink: buildFrontLink(this.config, FLOW, issued.encrypted),
      expiresAt: issued.expiresAt,
    });
  }

  async confirm(token: string): Promise<EmailChangeConfirmResponseDto> {
    const { verdict, user, record } = await resolveToken({
      prisma: this.prisma,
      jwtService: this.jwtService,
      cryptr: this.cryptr,
      delegate: this.prisma.emailChangeToken,
      token,
      isEligible: anyUser,
    });
    if (verdict === 'EXPIRED') throw apiError.gone('EMAIL_CHANGE_TOKEN_EXPIRED');
    if (verdict !== 'VALID' || !user || !record) throw apiError.notFound('EMAIL_CHANGE_TOKEN_NOT_FOUND');

    await this.prisma.$transaction(async (tx) => {
      // The address may have been taken during the 30-minute window
      await assertEmailAvailable(tx, record.newEmail, user.id);
      await tx.user.update({ where: { id: user.id }, data: { email: record.newEmail } });
      await tx.emailChangeToken.deleteMany({ where: { userId: user.id } });
      await tx.session.deleteMany({ where: { userId: user.id } });
    });

    // Courtesy notice to the previous address — never blocks the change
    this.mail
      .sendEmailChangeSuccessEmail({ to: user.email, fullName: fullName(user), newEmail: record.newEmail })
      .catch((err: Error) => this.logger.error(`E-mail change notice failed for ${user.id}: ${err.message}`));

    return { success: true, email: record.newEmail };
  }
}
