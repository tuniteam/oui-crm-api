import { EMAIL_CHANGE_CONFIRM_MAIL } from '../constants/email-change-email.constants';
import { COMMON_EMAIL_COPY } from '../mail.constants';
import { renderEmailLayout } from './email-layout';

export function buildEmailChangeConfirmEmailHtml(params: {
  fullName: string;
  platformName: string;
  confirmLink: string;
  ttlMinutes: number;
}): string {
  const { fullName, platformName, confirmLink, ttlMinutes } = params;
  return renderEmailLayout({
    platformName,
    paragraphs: [
      COMMON_EMAIL_COPY.HELLO(fullName),
      EMAIL_CHANGE_CONFIRM_MAIL.BODY_INTRO(platformName),
      EMAIL_CHANGE_CONFIRM_MAIL.BODY_ACTION,
    ],
    cta: { label: EMAIL_CHANGE_CONFIRM_MAIL.CTA_LABEL, href: confirmLink },
    notice: { text: EMAIL_CHANGE_CONFIRM_MAIL.TTL_WARNING(ttlMinutes) },
    footerLine: COMMON_EMAIL_COPY.FOOTER_IGNORE,
  });
}
