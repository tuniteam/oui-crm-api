export const EMAIL_CHANGE_CONFIRM_MAIL = {
  SUBJECT: (platformName: string) => `${platformName} — Confirmez votre nouvelle adresse email`,
  TEXT: (confirmLink: string) =>
    `Pour confirmer le changement de votre adresse email, ouvrez ce lien : ${confirmLink}`,
  BODY_INTRO: (platformName: string) =>
    `Une demande de changement d'adresse email a été effectuée sur la plateforme ${platformName}.`,
  BODY_ACTION: `Cliquez sur le bouton ci-dessous pour confirmer que cette adresse vous appartient :`,
  CTA_LABEL: `Confirmer mon nouvel email`,
  TTL_WARNING: (ttlMinutes: number) =>
    `⚠️ Ce lien est valable ${ttlMinutes} minutes. Passé ce délai, vous devrez refaire une demande.`,
} as const;

export const EMAIL_CHANGE_SUCCESS_MAIL = {
  SUBJECT: (platformName: string) => `${platformName} — Votre adresse email a été modifiée`,
  TEXT: (newEmail: string) => `Votre adresse email a été modifiée. Elle est désormais : ${newEmail}`,
  BODY_INTRO: (platformName: string, newEmail: string) =>
    `L'adresse email de votre compte ${platformName} a été modifiée. Elle est désormais : ${newEmail}.`,
  WARNING: `Si vous n'êtes pas à l'origine de ce changement, contactez immédiatement le support.`,
} as const;
