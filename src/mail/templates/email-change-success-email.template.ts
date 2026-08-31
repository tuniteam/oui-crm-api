import { EMAIL_CHANGE_SUCCESS_MAIL } from '../constants/email-change-email.constants';
import { COMMON_EMAIL_COPY } from '../mail.constants';
import { renderEmailLayout } from './email-layout';

export function buildEmailChangeSuccessEmailHtml(params: {
  fullName: string;
  platformName: string;
  newEmail: string;
}): string {
  const { fullName, platformName, newEmail } = params;
  return renderEmailLayout({
    platformName,
    paragraphs: [COMMON_EMAIL_COPY.HELLO(fullName), EMAIL_CHANGE_SUCCESS_MAIL.BODY_INTRO(platformName, newEmail)],
    notice: { text: EMAIL_CHANGE_SUCCESS_MAIL.WARNING, tone: 'warning' },
  });
}
