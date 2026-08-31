// ============================================
// OUI-CRM - Mail constants: SMTP defaults, environment switch, shared e-mail copy and theme
// ============================================

/** Max concurrent SMTP sends when dispatching a batch of e-mails. */
export const MAIL_SMTP_CONCURRENCY = 5;

export const MAIL_ENV = {
  EMAIL_SENDING_ENABLED: 'EMAIL_SENDING_ENABLED',
  EMAIL_FROM: 'EMAIL_FROM',
  PLATFORM_NAME: 'PLATFORM_NAME',
  SMTP_PROVIDER: 'SMTP_PROVIDER',
  SMTP_HOST: 'SMTP_HOST',
  SMTP_PORT: 'SMTP_PORT',
  SMTP_USER: 'SMTP_USER',
  SMTP_PASS: 'SMTP_PASS',
} as const;

/** SMTP_PROVIDER=mailpit|gmail selects a prefixed set of SMTP_* variables (local dev switch). */
export const SMTP_PROVIDER_PREFIX: Record<string, string> = {
  mailpit: 'MAILPIT_',
  gmail: 'GMAIL_',
};

export const DEFAULT_SMTP_PORT = 587;
/** Implicit TLS (SMTPS) port: nodemailer `secure` must be true. */
export const SMTP_IMPLICIT_TLS_PORT = 465;

/**
 * OUI-CRM platform theme for account e-mails (activation, reset, e-mail change).
 * Source of truth: oui-crm-web `src/styles/theme.oui-crm.css` (handoff charte 2026-08-31):
 * brand azure #0369A1 (201°), semantic colors decoupled from brand accents (WCAG AA on white).
 * Webfonts are ignored by Outlook/Gmail app — the system fallback stack matters, keep it.
 */
export const EMAIL_THEME = {
  fontStack: `'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`,
  fontImportUrl:
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap',
  colorPrimary: '#0369A1',
  colorText: '#333333',
  colorTextMuted: '#6C757D',
  colorBorder: '#DEE2E6',
  colorBgPage: '#F8F9FA',
  colorWarning: '#B45309',
  /** Links longer than this are truncated in the fallback block. */
  displayLinkMaxLength: 60,
} as const;

/** Copy shared by every account e-mail (French: end-user facing). */
export const COMMON_EMAIL_COPY = {
  HELLO: (fullName: string) => `Bonjour ${fullName},`,
  FALLBACK_TITLE: `Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :`,
  FOOTER_IGNORE: `Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.`,
  FOOTER_NO_REPLY: (platformName: string) =>
    `Cet email a été envoyé automatiquement par ${platformName}. Merci de ne pas répondre à cette adresse.`,
  COPYRIGHT: (platformName: string, year: number) => `© ${year} ${platformName}`,
} as const;
