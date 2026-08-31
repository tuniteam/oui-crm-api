export const PASSWORD_RESET_MAIL = {
  SUBJECT: (platformName: string) => `${platformName} — Réinitialisation de votre mot de passe`,
  TEXT: (resetLink: string) => `Pour réinitialiser votre mot de passe, ouvrez ce lien : ${resetLink}`,
  BODY_INTRO: (platformName: string) =>
    `Vous avez demandé la réinitialisation de votre mot de passe sur la plateforme ${platformName}.`,
  BODY_ACTION: `Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe :`,
  CTA_LABEL: `Réinitialiser mon mot de passe`,
  TTL_WARNING: (ttlMinutes: number) =>
    `⚠️ Ce lien est valable ${ttlMinutes} minutes. Passé ce délai, vous devrez refaire une demande.`,
} as const;
