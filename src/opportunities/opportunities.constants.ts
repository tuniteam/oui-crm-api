// ============================================
// OUI-CRM - Opportunities constants (US-02-09)
// ============================================

import { OpportunityStageCode } from '@prisma/client';

/** Actions du journal (AUDIT_OBJECTS.OPPORTUNITY). */
export const OPPORTUNITIES_AUDIT = {
  CREATE: 'opportunity.create',
  UPDATE: 'opportunity.update',
  STAGE: 'opportunity.stage',
  LOSE: 'opportunity.lose',
  DELETE: 'opportunity.delete',
} as const;

/**
 * Étapes ouvertes, dans l'ordre du pipeline (SPEC-01 §3.7). `WON` et `LOST` n'en sont pas :
 * elles sont posées par la signature ou le refus d'un devis, ou par la route `lose` — jamais
 * par un changement d'étape à la main.
 */
export const OPEN_STAGES: readonly OpportunityStageCode[] = [
  OpportunityStageCode.QUALIFICATION,
  OpportunityStageCode.DEMONSTRATION,
  OpportunityStageCode.QUOTE_SENT,
  OpportunityStageCode.NEGOTIATING,
  OpportunityStageCode.VERBAL_AGREEMENT,
];

/** Étapes fermées : une opportunité qui les porte a libéré le créneau de sa fiche. */
export const CLOSED_STAGE_CODES: readonly OpportunityStageCode[] = [
  OpportunityStageCode.WON,
  OpportunityStageCode.LOST,
];

export function isOpenStage(stage: OpportunityStageCode): boolean {
  return OPEN_STAGES.includes(stage);
}

/** Cartes servies par colonne du tableau ; au-delà, `hasMore` (même règle que le kanban L1). */
export const BOARD_ITEMS_PER_COLUMN = 200;

export const OPPORTUNITY_LABEL_MAX_LENGTH = 200;
export const OPPORTUNITY_COMMENT_MAX_LENGTH = 1000;

/** Bornes d'une pondération saisie à la main (SPEC-05 Q4). */
export const PROBABILITY_MIN = 0;
export const PROBABILITY_MAX = 100;
