// ============================================
// OUI-CRM - Quotes constants (US-02-02, US-02-03)
// ============================================

import { BillingMode, QuoteStatus, QuoteType } from '@prisma/client';

/** Actions du journal (AUDIT_OBJECTS.QUOTE). Les transitions arrivent en phase F. */
export const QUOTES_AUDIT = {
  CREATE: 'quote.create',
  UPDATE: 'quote.update',
  DELETE: 'quote.delete',
} as const;

/**
 * Un devis ne se modifie et ne se supprime qu'en brouillon : dès la soumission, ses lignes
 * sont figées et il devient une pièce commerciale (SPEC-04 §3.1).
 */
export const EDITABLE_STATUSES: readonly QuoteStatus[] = [QuoteStatus.DRAFT];

/** Reconstruction de l'historique depuis le journal : action → statut atteint. */
export const STATUS_BY_AUDIT_ACTION: Record<string, QuoteStatus> = {
  [QUOTES_AUDIT.CREATE]: QuoteStatus.DRAFT,
};

/** Date de démarrage par défaut : date du devis + 30 jours (SPEC-04 déc. 4, comportement V8). */
export const DEFAULT_START_OFFSET_DAYS = 30;

/** Valeurs par défaut d'une configuration, complétées par les réglages du projet. */
export const DEFAULT_BILLING: BillingMode = BillingMode.MONTHLY;
export const DEFAULT_QUOTE_TYPE: QuoteType = QuoteType.INITIAL;
export const DEFAULT_CANCELLABLE = true;
export const DEFAULT_TRIAL_CLAUSE = false;

/** Longueur d'une clé de formule ou de poste, alignée sur le schéma. */
export const PLAN_KEY_MAX_LENGTH = 60;
export const REASON_MAX_LENGTH = 1000;
