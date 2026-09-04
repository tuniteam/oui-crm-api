import { QuoteStatus } from '@prisma/client';

// ============================================
// OUI-CRM - Document rendering constants (US-02-08)
// ============================================

/**
 * Marqueur de saut de page du gabarit. `react-pdf-html` **ignore** `page-break-before` : le
 * service découpe le HTML fusionné sur ce marqueur et rend une page par tronçon (vérifié le
 * 04/09). La coupure est ainsi explicite dans le gabarit, et vérifiable en recette.
 */
export const PAGE_BREAK_MARKER = '<pagebreak />';

/** Le seul format livré au L2 ; `docx` viendra du même HTML (SPEC-02 §5.3). */
export const SUPPORTED_FORMATS = ['pdf'] as const;
export type DocumentFormat = (typeof SUPPORTED_FORMATS)[number];

/**
 * Filigrane des documents qui ne sont pas officiels : tant que le devis n'a pas atteint `SENT`,
 * personne ne l'a approuvé et rien n'est parti au client (SPEC-14 D18).
 */
export const WATERMARK_LABEL = 'BROUILLON';

/** Les statuts qui portent le filigrane : tant que le devis n'a pas atteint `SENT` (D18). */
export const WATERMARKED_STATUSES: readonly QuoteStatus[] = [
  QuoteStatus.DRAFT,
  QuoteStatus.PENDING_VALIDATION,
];

/** Avertissements servis en en-tête plutôt qu'en échec (SPEC-02 §5.3). */
export const DOCUMENT_WARNINGS_HEADER = 'X-Document-Warnings';
export const SIGNATURE_IMAGE_MISSING = 'SIGNATURE_IMAGE_MISSING';

/** Charte OUI-CRM (EMAIL_THEME) — le filigrane reprend l'azur du produit. */
export const WATERMARK_STYLE = {
  color: '#0369A1',
  opacity: 0.1,
  fontSize: 84,
  top: 320,
  left: 80,
  rotation: -35,
} as const;

/** Marge d'une page A4, alignée sur le rapport d'import déjà en production. */
export const PAGE_PADDING = 36;

/** Un zéro ne s'imprime pas dans le tableau pluriannuel : il se raye (SPEC-01 §6.2). */
export const EMPTY_AMOUNT = '—';

/** Organisme fictif de la prévisualisation : un gabarit se juge sans toucher aux vraies données. */
export const PREVIEW_ORGANIZATION = 'Exempleville';

/** Espace insécable ordinaire (U+00A0) : la seule que les polices PDF standard impriment. */
export const NBSP = ' ';

/** Locale et devise des montants imprimés — le gabarit ne formate rien. */
export const MONEY_LOCALE = 'fr-FR';
