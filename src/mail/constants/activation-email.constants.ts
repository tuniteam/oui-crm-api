export const ACTIVATION_MAIL = {
  SUBJECT: (platformName: string) => `${platformName} — Invitation à activer votre compte`,
  TEXT: (activationLink: string) => `Activez votre compte : ${activationLink}`,
  INVITED_TO_PLATFORM: (platformName: string) =>
    `Vous avez été invité(e) à rejoindre la plateforme <b>${platformName}</b>.`,
  BODY_INTRO: `Pour activer votre compte, veuillez cliquer sur le bouton ci-dessous :`,
  CTA_LABEL: `Activer mon compte`,
  TTL_WARNING: (ttlHours: number) =>
    `⚠️ Ce lien est valable ${ttlHours} heures. S'il a expiré, cliquez dessus : un nouveau lien d'activation vous sera envoyé automatiquement par email.`,
} as const;
