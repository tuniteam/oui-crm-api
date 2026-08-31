import { COMMON_EMAIL_COPY, EMAIL_THEME } from '../mail.constants';

export interface EmailLayoutParams {
  platformName: string;
  /** Paragraphs of the body, already in the recipient's language. */
  paragraphs: string[];
  cta?: { label: string; href: string };
  /** Boxed notice under the CTA (link validity, warning…). */
  notice?: { text: string; tone?: 'muted' | 'warning' };
  /** First footer line; the no-reply line and the copyright are always added. */
  footerLine?: string;
}

/**
 * Single HTML shell for every account e-mail (table layout for mail clients).
 * Templates only provide their copy.
 */
export function renderEmailLayout(params: EmailLayoutParams): string {
  const t = EMAIL_THEME;
  const { platformName, paragraphs, cta, notice, footerLine } = params;
  const year = new Date().getUTCFullYear();

  const displayLink = cta
    ? cta.href.length > t.displayLinkMaxLength
      ? `${cta.href.slice(0, t.displayLinkMaxLength)}...`
      : cta.href
    : '';

  const box = (content: string, color: string, bold = false) => `
    <div style="border:1px solid ${t.colorBorder};border-radius:10px;background:${t.colorBgPage};padding:14px 16px;font-family:${t.fontStack};font-size:12px;line-height:1.5;color:${color};${bold ? 'font-weight:600;' : ''}word-break:break-all;">
      ${content}
    </div>`;

  return `
  <style>@import url('${t.fontImportUrl}');</style>
  <div style="background:${t.colorBgPage};margin:0;padding:0;font-family:${t.fontStack};">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="640"
                 style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,0.06);border:1px solid ${t.colorBorder};">
            <tr>
              <td style="padding:32px 40px 0;font-family:${t.fontStack};color:${t.colorText};font-size:15px;line-height:1.6;">
                ${paragraphs.map((p, i) => `<p style="margin:0 0 ${i === paragraphs.length - 1 ? 26 : 16}px;">${p}</p>`).join('\n')}
              </td>
            </tr>
            ${
              cta
                ? `
            <tr>
              <td align="center" style="padding:0 0 24px;">
                <a href="${cta.href}" style="display:inline-block;background:${t.colorPrimary};color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:10px;font-family:${t.fontStack};font-size:15px;font-weight:600;min-width:260px;text-align:center;">
                  ${cta.label}
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 18px;font-family:${t.fontStack};font-size:12px;color:${t.colorTextMuted};">
                <p style="margin:0 0 8px;">${COMMON_EMAIL_COPY.FALLBACK_TITLE}</p>
                ${box(`<a href="${cta.href}" style="color:${t.colorPrimary};text-decoration:none;">${displayLink}</a>`, t.colorTextMuted)}
              </td>
            </tr>`
                : ''
            }
            ${
              notice
                ? `
            <tr>
              <td style="padding:0 40px 24px;">
                ${box(notice.text, notice.tone === 'warning' ? t.colorWarning : t.colorTextMuted, notice.tone === 'warning')}
              </td>
            </tr>`
                : ''
            }
            <tr>
              <td style="padding:0 40px 32px;font-family:${t.fontStack};font-size:12px;color:${t.colorTextMuted};line-height:1.6;">
                ${footerLine ? `<p style="margin:0 0 8px;">${footerLine}</p>` : ''}
                <p style="margin:0 0 16px;">${COMMON_EMAIL_COPY.FOOTER_NO_REPLY(platformName)}</p>
                <p style="text-align:center;font-size:11px;color:${t.colorTextMuted};margin:0;">
                  ${COMMON_EMAIL_COPY.COPYRIGHT(platformName, year)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;
}
