// ============================================
// OUI-CRM - Quotes constants (US-02-02, US-02-03)
// ============================================

import { BillingMode, OpportunityStageCode, QuoteStatus, QuoteType, SalesStatus } from '@prisma/client';

/** Actions du journal (AUDIT_OBJECTS.QUOTE). */
export const QUOTES_AUDIT = {
  CREATE: 'quote.create',
  UPDATE: 'quote.update',
  DELETE: 'quote.delete',
  SUBMIT: 'quote.submit',
  VALIDATE: 'quote.validate',
  REJECT: 'quote.reject',
  FOLLOW_UP: 'quote.followUp',
  NEGOTIATE: 'quote.negotiate',
  DECLINE: 'quote.decline',
  EXPIRE: 'quote.expire',
  REOPEN: 'quote.reopen',
} as const;

/**
 * Un devis ne se modifie et ne se supprime qu'en brouillon : dès la soumission, ses lignes
 * sont figées et il devient une pièce commerciale (SPEC-04 §3.1).
 */
export const EDITABLE_STATUSES: readonly QuoteStatus[] = [QuoteStatus.DRAFT];

/**
 * Actions du journal qui racontent la vie du devis. Chacune écrit le statut atteint dans ses
 * métadonnées (`metadata.status`) : l'historique se relit donc **exactement**, sans table de
 * plus et sans deviner — `submit` mène à `SENT` ou à `PENDING_VALIDATION` selon la remise, une
 * correspondance figée action → statut aurait menti une fois sur deux.
 */
export const QUOTE_LIFECYCLE_ACTIONS: readonly string[] = [
  QUOTES_AUDIT.CREATE,
  QUOTES_AUDIT.SUBMIT,
  QUOTES_AUDIT.VALIDATE,
  QUOTES_AUDIT.REJECT,
  QUOTES_AUDIT.FOLLOW_UP,
  QUOTES_AUDIT.NEGOTIATE,
  QUOTES_AUDIT.DECLINE,
  QUOTES_AUDIT.EXPIRE,
];

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

// ---------------------------------------------------------------------------- cycle de vie

/**
 * **La** table des transitions (SPEC-01 §3.8). Une route d'action par transition, parce que
 * chacune a son propre effet — figer les lignes, exiger un motif, créer une relance —, mais
 * une seule table dit ce qui est permis : ajouter un statut se voit ici, pas dans sept gardes
 * disséminées.
 */
export const QUOTE_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  [QuoteStatus.DRAFT]: [QuoteStatus.SENT, QuoteStatus.PENDING_VALIDATION],
  [QuoteStatus.PENDING_VALIDATION]: [QuoteStatus.SENT, QuoteStatus.DRAFT],
  [QuoteStatus.SENT]: [QuoteStatus.FOLLOWED_UP, QuoteStatus.NEGOTIATING, QuoteStatus.SIGNED, QuoteStatus.REJECTED, QuoteStatus.EXPIRED],
  [QuoteStatus.FOLLOWED_UP]: [QuoteStatus.FOLLOWED_UP, QuoteStatus.NEGOTIATING, QuoteStatus.SIGNED, QuoteStatus.REJECTED, QuoteStatus.EXPIRED],
  [QuoteStatus.NEGOTIATING]: [QuoteStatus.SIGNED, QuoteStatus.REJECTED, QuoteStatus.EXPIRED],
  // Issues : un devis signé, refusé ou expiré ne bouge plus. Une expiration se rouvre en
  // créant un **nouveau** brouillon, elle ne ressuscite pas celui-ci.
  [QuoteStatus.SIGNED]: [],
  [QuoteStatus.REJECTED]: [],
  [QuoteStatus.EXPIRED]: [],
};

export function canTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[from].includes(to);
}

/**
 * Ce que le statut d'un devis impose à son opportunité (SPEC-01 §3.8). `null` = l'opportunité
 * ne bouge pas : un devis mis en attente de validation n'a encore rien dit au client.
 */
export const OPPORTUNITY_STAGE_BY_QUOTE_STATUS: Partial<Record<QuoteStatus, OpportunityStageCode>> = {
  [QuoteStatus.SENT]: OpportunityStageCode.QUOTE_SENT,
  [QuoteStatus.FOLLOWED_UP]: OpportunityStageCode.QUOTE_SENT,
  [QuoteStatus.NEGOTIATING]: OpportunityStageCode.NEGOTIATING,
  [QuoteStatus.SIGNED]: OpportunityStageCode.WON,
  [QuoteStatus.REJECTED]: OpportunityStageCode.LOST,
  [QuoteStatus.EXPIRED]: OpportunityStageCode.LOST,
};

/**
 * Un devis parti chez le client sort la fiche de la prospection froide (SPEC-01 §3.8) — mais
 * seulement depuis ces deux statuts : une fiche déjà en RDV ou close ne régresse pas.
 */
export const QUOTE_SENT_STATUSES: readonly QuoteStatus[] = [
  QuoteStatus.SENT,
  QuoteStatus.FOLLOWED_UP,
  QuoteStatus.NEGOTIATING,
];
export const BUMPS_TO_IN_PROGRESS_FROM: readonly SalesStatus[] = [SalesStatus.NOT_CONTACTED, SalesStatus.TO_CONTACT];

/** Motifs de perte posés par le CRM lui-même, pas par le commercial (référentiel LOSS_REASON). */
export const LOSS_REASON_ON_DECLINE = 'ABANDONED';
export const LOSS_REASON_ON_EXPIRY = 'NO_RESPONSE';

/** Type d'activité créé par une relance manuelle (référentiel ACTIVITY_TYPE). */
export const FOLLOW_UP_ACTIVITY_TYPE = 'FOLLOW_UP';
