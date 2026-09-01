import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { APP_ENV, DEFAULT_PLATFORM_NAME } from '@/common/constants/app.constants';
import { getBoolean, getNumber } from '@/common/utils/config.utils';
import { MS_PER_HOUR, MS_PER_MINUTE } from '@/common/utils/date.utils';
import { ACTIVATION_MAIL } from './constants/activation-email.constants';
import { EMAIL_CHANGE_CONFIRM_MAIL, EMAIL_CHANGE_SUCCESS_MAIL } from './constants/email-change-email.constants';
import { PASSWORD_RESET_MAIL } from './constants/password-reset-email.constants';
import { DEFAULT_SMTP_PORT, MAIL_ENV, SMTP_IMPLICIT_TLS_PORT, SMTP_PROVIDER_PREFIX } from './mail.constants';
import { buildActivationEmailHtml } from './templates/activation-email.template';
import { buildEmailChangeConfirmEmailHtml } from './templates/email-change-confirm-email.template';
import { buildEmailChangeSuccessEmailHtml } from './templates/email-change-success-email.template';
import { buildPasswordResetEmailHtml } from './templates/password-reset-email.template';

/** Remaining validity of an e-mailed link, rounded up, in the unit shown to the recipient. */
const remaining = (expiresAt: Date, unitMs: number): number =>
  Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / unitMs));

/**
 * Account e-mails (activation, password reset, e-mail change). Business e-mails go through
 * EmailLogService.queueAndDispatch with a closure calling one of these methods.
 * Returns false (never throws) when sending is disabled or fails: callers log the outcome.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly enabled: boolean;
  private readonly platformName: string;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.enabled = getBoolean(this.config, MAIL_ENV.EMAIL_SENDING_ENABLED);
    this.platformName = this.config.get<string>(APP_ENV.PLATFORM_NAME) || DEFAULT_PLATFORM_NAME;
    // No silent fallback for the sender: a misconfigured address must fail at boot when sending is on
    this.from = this.enabled
      ? this.config.getOrThrow<string>(MAIL_ENV.EMAIL_FROM)
      : (this.config.get<string>(MAIL_ENV.EMAIL_FROM) ?? '');

    // Local dev switch: SMTP_PROVIDER=mailpit|gmail selects a prefixed set of SMTP_* variables;
    // unset (or any other value) → the generic SMTP_* used in UAT/prod.
    const provider = (this.config.get<string>(MAIL_ENV.SMTP_PROVIDER) || '').toLowerCase();
    const prefix = SMTP_PROVIDER_PREFIX[provider] ?? '';
    const smtp = (key: string) => this.config.get<string>(`${prefix}${key}`) ?? this.config.get<string>(key);

    const port = Number(smtp(MAIL_ENV.SMTP_PORT) ?? DEFAULT_SMTP_PORT);
    const user = smtp(MAIL_ENV.SMTP_USER);
    this.transporter = nodemailer.createTransport({
      host: smtp(MAIL_ENV.SMTP_HOST),
      port,
      secure: port === SMTP_IMPLICIT_TLS_PORT,
      // Mailpit has no auth — don't pass empty credentials as they still trigger AUTH negotiation.
      auth: user ? { user, pass: smtp(MAIL_ENV.SMTP_PASS) } : undefined,
    });
  }

  sendActivationEmail(params: { to: string; fullName: string; activationLink: string; expiresAt: Date }): Promise<boolean> {
    return this.send({
      to: params.to,
      subject: ACTIVATION_MAIL.SUBJECT(this.platformName),
      text: ACTIVATION_MAIL.TEXT(params.activationLink),
      buildHtml: () =>
        buildActivationEmailHtml({
          fullName: params.fullName,
          platformName: this.platformName,
          activationLink: params.activationLink,
          ttlHours: remaining(params.expiresAt, MS_PER_HOUR),
        }),
    });
  }

  sendPasswordResetEmail(params: { to: string; fullName: string; resetLink: string; expiresAt: Date }): Promise<boolean> {
    return this.send({
      to: params.to,
      subject: PASSWORD_RESET_MAIL.SUBJECT(this.platformName),
      text: PASSWORD_RESET_MAIL.TEXT(params.resetLink),
      buildHtml: () =>
        buildPasswordResetEmailHtml({
          fullName: params.fullName,
          platformName: this.platformName,
          resetLink: params.resetLink,
          ttlMinutes: remaining(params.expiresAt, MS_PER_MINUTE),
        }),
    });
  }

  sendEmailChangeConfirmEmail(params: { to: string; fullName: string; confirmLink: string; expiresAt: Date }): Promise<boolean> {
    return this.send({
      to: params.to,
      subject: EMAIL_CHANGE_CONFIRM_MAIL.SUBJECT(this.platformName),
      text: EMAIL_CHANGE_CONFIRM_MAIL.TEXT(params.confirmLink),
      buildHtml: () =>
        buildEmailChangeConfirmEmailHtml({
          fullName: params.fullName,
          platformName: this.platformName,
          confirmLink: params.confirmLink,
          ttlMinutes: remaining(params.expiresAt, MS_PER_MINUTE),
        }),
    });
  }

  sendEmailChangeSuccessEmail(params: { to: string; fullName: string; newEmail: string }): Promise<boolean> {
    return this.send({
      to: params.to,
      subject: EMAIL_CHANGE_SUCCESS_MAIL.SUBJECT(this.platformName),
      text: EMAIL_CHANGE_SUCCESS_MAIL.TEXT(params.newEmail),
      buildHtml: () =>
        buildEmailChangeSuccessEmailHtml({
          fullName: params.fullName,
          platformName: this.platformName,
          newEmail: params.newEmail,
        }),
    });
  }

  /** Generic send for business e-mails whose HTML is built by the caller. */
  sendRaw(params: { to: string; subject: string; text: string; html: string }): Promise<boolean> {
    return this.send({ ...params, buildHtml: () => params.html });
  }

  private async send(params: { to: string; subject: string; text: string; buildHtml: () => string }): Promise<boolean> {
    if (!this.enabled) return false;

    let html: string;
    try {
      html = params.buildHtml();
    } catch (e) {
      this.logger.error(`Template build failed for "${params.subject}": ${(e as Error).message}`);
      return false;
    }

    try {
      await this.transporter.sendMail({ from: this.from, to: params.to, subject: params.subject, text: params.text, html });
      return true;
    } catch (e) {
      this.logger.error(`sendMail failed for "${params.subject}": ${(e as Error).message}`);
      return false;
    }
  }
}
