import { ACTIVATION_MAIL } from '../constants/activation-email.constants';
import { COMMON_EMAIL_COPY } from '../mail.constants';
import { renderEmailLayout } from './email-layout';

export function buildActivationEmailHtml(params: {
  fullName: string;
  platformName: string;
  activationLink: string;
  ttlHours: number;
}): string {
  const { fullName, platformName, activationLink, ttlHours } = params;
  return renderEmailLayout({
    platformName,
    paragraphs: [
      COMMON_EMAIL_COPY.HELLO(fullName),
      ACTIVATION_MAIL.INVITED_TO_PLATFORM(platformName),
      ACTIVATION_MAIL.BODY_INTRO,
    ],
    cta: { label: ACTIVATION_MAIL.CTA_LABEL, href: activationLink },
    notice: { text: ACTIVATION_MAIL.TTL_WARNING(ttlHours) },
    footerLine: COMMON_EMAIL_COPY.FOOTER_IGNORE,
  });
}
