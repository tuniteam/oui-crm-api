import { PASSWORD_RESET_MAIL } from '../constants/password-reset-email.constants';
import { COMMON_EMAIL_COPY } from '../mail.constants';
import { renderEmailLayout } from './email-layout';

export function buildPasswordResetEmailHtml(params: {
  fullName: string;
  platformName: string;
  resetLink: string;
  ttlMinutes: number;
}): string {
  const { fullName, platformName, resetLink, ttlMinutes } = params;
  return renderEmailLayout({
    platformName,
    paragraphs: [
      COMMON_EMAIL_COPY.HELLO(fullName),
      PASSWORD_RESET_MAIL.BODY_INTRO(platformName),
      PASSWORD_RESET_MAIL.BODY_ACTION,
    ],
    cta: { label: PASSWORD_RESET_MAIL.CTA_LABEL, href: resetLink },
    notice: { text: PASSWORD_RESET_MAIL.TTL_WARNING(ttlMinutes) },
    footerLine: COMMON_EMAIL_COPY.FOOTER_IGNORE,
  });
}
