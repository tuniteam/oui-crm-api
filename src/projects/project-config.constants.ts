// ============================================
// OUI-CRM - Default configuration of a new project (SPEC-10 §3.1)
// Generic CRM values only: market-specific lists (structure types, competitors…)
// come from the PROJECT_CONFIG import or manual configuration.
// ============================================

import { FeatureCode, Prisma } from '@prisma/client';

export interface ReferenceItemSeed {
  key: string;
  label: string;
  metadata?: Prisma.InputJsonValue;
}

/** Reference categories (SPEC-10 §1) — the only values accepted by /reference-items. */
export const REFERENCE_CATEGORIES = [
  'STRUCTURE_TYPE',
  'TAG',
  'LEAD_SOURCE',
  'SERVICE',
  'ACTIVITY_TYPE',
  'ACTIVITY_RESULT',
  'TICKET_CATEGORY',
  'TRAINING_TYPE',
  'VENDOR',
  'SOLUTION',
  'LOSS_REASON',
] as const;
export type ReferenceCategory = (typeof REFERENCE_CATEGORIES)[number];

export interface ProjectConfig {
  settings: {
    vatRate: number;
    revenueTarget: number;
    meetingTarget: number;
    quoteValidityDays: number;
    noticeMonths: number;
    defaultCommitmentMonths: number;
    discountCap: number;
    retentionMonths: number;
    stageProbabilities: Record<string, number>;
    company: Record<string, string>;
  };
  features: Record<FeatureCode, boolean>;
  referenceItems: Partial<Record<ReferenceCategory, ReferenceItemSeed[]>>;
  scopes: { name: string; description: string; regions: string[]; departments: string[]; portfolioOnly: boolean }[];
}

/**
 * Opportunity stage probabilities (SPEC-01 §3.7, V8 defaults). WON and LOST are fixed.
 */
/** First pricing grid of a project (bootstrap, configuration copy, seed). */
export const INITIAL_PRICING_GRID_VERSION = 1;

export const DEFAULT_STAGE_PROBABILITIES: Record<string, number> = {
  QUALIFICATION: 10,
  DEMONSTRATION: 30,
  QUOTE_SENT: 50,
  NEGOTIATING: 70,
  VERBAL_AGREEMENT: 90,
  WON: 100,
  LOST: 0,
};

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  settings: {
    vatRate: 20,
    revenueTarget: 0,
    meetingTarget: 0,
    quoteValidityDays: 30,
    noticeMonths: 2,
    defaultCommitmentMonths: 36,
    discountCap: 30,
    retentionMonths: 36,
    stageProbabilities: DEFAULT_STAGE_PROBABILITIES,
    company: {},
  },
  features: {
    SALES: true,
    BILLING: true,
    SUPPORT: true,
    STATS: true,
  },
  referenceItems: {
    STRUCTURE_TYPE: [{ key: 'ORGANIZATION', label: 'Organisation', metadata: { territorial: false } }],
    TAG: [{ key: 'HOT', label: 'Chaud' }],
    LEAD_SOURCE: [
      { key: 'OUTBOUND', label: 'Prospection sortante' },
      { key: 'WEB_FORM', label: 'Formulaire site web' },
      { key: 'WORD_OF_MOUTH', label: 'Bouche à oreille' },
      { key: 'MARKETING', label: 'Campagne marketing' },
      { key: 'REFERRAL_PARTNER', label: "Apporteur d'affaires" },
      { key: 'INBOUND_CALL', label: 'Appel entrant' },
      { key: 'LEAD_TRANSFER', label: 'Transfert de lead' },
      { key: 'SPONSORSHIP', label: 'Parrainage' },
    ],
    ACTIVITY_TYPE: [
      { key: 'CALL', label: 'Appel', metadata: { ics: false } },
      { key: 'EMAIL', label: 'Email', metadata: { ics: false } },
      { key: 'MEETING', label: 'RDV physique', metadata: { ics: true, defaultDurationMin: 90 } },
      { key: 'VIDEO_MEETING', label: 'Visioconférence', metadata: { ics: false, defaultDurationMin: 30 } },
      { key: 'DEMO', label: 'Démonstration', metadata: { ics: true, defaultDurationMin: 90 } },
      { key: 'FOLLOW_UP', label: 'Relance', metadata: { ics: false } },
      { key: 'LETTER', label: 'Courrier', metadata: { ics: false } },
      { key: 'NOTE', label: 'Note', metadata: { ics: false } },
    ],
    ACTIVITY_RESULT: [
      { key: 'CALL_BACK', label: 'À rappeler' },
      { key: 'INTERESTED', label: 'Intéressé' },
      { key: 'NOT_INTERESTED', label: 'Non intéressé' },
      { key: 'NO_ANSWER', label: 'Sans réponse' },
      { key: 'WRONG_CONTACT', label: 'Mauvais interlocuteur' },
      { key: 'MEETING_BOOKED', label: 'RDV obtenu' },
      { key: 'DOCUMENTATION_SENT', label: 'Documentation envoyée' },
    ],
    TICKET_CATEGORY: [
      { key: 'BLOCKING_BUG', label: 'Anomalie bloquante', metadata: { defaultPriority: 'HIGH' } },
      { key: 'MINOR_BUG', label: 'Anomalie mineure' },
      { key: 'CONFIGURATION', label: 'Paramétrage' },
      { key: 'FUNCTIONAL_QUESTION', label: 'Question fonctionnelle' },
      { key: 'BILLING', label: 'Facturation' },
      { key: 'FEATURE_REQUEST', label: "Demande d'évolution" },
    ],
    TRAINING_TYPE: [
      { key: 'ADMIN', label: 'Formation gestionnaire' },
      { key: 'AGENTS', label: 'Formation agents' },
      { key: 'END_USER_PORTAL', label: 'Formation portail' },
      { key: 'BILLING', label: 'Formation facturation' },
      { key: 'ONBOARDING', label: 'Reprise / accompagnement' },
    ],
    LOSS_REASON: [
      { key: 'BUDGET', label: 'Budget non voté' },
      { key: 'COMPETITOR', label: 'Concurrent retenu' },
      { key: 'NO_RESPONSE', label: 'Sans suite' },
      { key: 'ABANDONED', label: 'Abandonné' },
      { key: 'OTHER', label: 'Autre' },
    ],
  },
  scopes: [
    {
      name: 'Tout le territoire',
      description: 'Aucune restriction géographique.',
      regions: [],
      departments: [],
      portfolioOnly: false,
    },
  ],
};

/**
 * Empty pricing grid v1: one bracket, one plan at 0 — the project cannot issue quotes until
 * the grid is configured (PRICING_GRID_EMPTY at simulation, SPEC-10 §3.1).
 */
export const EMPTY_PRICING_GRID_CONTENT = {
  brackets: [{ label: 'Tous', min: 0, max: null }],
  plans: ['STANDARD'],
  subscription: { STANDARD: [0] },
  options: [],
  setupFees: {},
  extras: [],
};
