// ============================================
// OUI-CRM - OUICRM_V2_1 takeover profile: workbook layout + mapping tables (SPEC-05)
// ============================================

import { Priority, SalesStatus } from '@prisma/client';

/** The definitive workbook (decision D2, 02/09/2026): docs/OUICRM_v2_1.xlsx of 14/08/2026. */
export const OUICRM = {
  /** Sheet names are matched after stripping emojis and trimming. */
  LEADS_SHEET: 'LEADS',
  PIPELINE_SHEET: 'PIPELINE OPPORTUNITÉS',
  /** Row 5 = headers, row 6 = field-type row, data starts at row 7 (SPEC-05 §1). */
  LEADS_DATA_START: 7,
  /** Q1 (31/08/2026): default sales rep of the Leads = Wiem Bousaid, matched by initials. */
  DEFAULT_REP_INITIALS: 'WB',
} as const;

/** Leads columns are positional (A..I) — column I has no header in the workbook. */
export const LEADS_COLUMNS = {
  DEPT: 1,
  NAME: 2,
  SOURCE: 3,
  ETIQUETTE: 4,
  EDITOR: 5,
  STATUS: 6,
  COMMENT: 7,
  MEETING_DATE: 8,
  COMMENT_2: 9,
} as const;

/** §3.1 — Statut Prospection (Leads F) → salesStatus; empty cell → TO_CONTACT. */
export const LEAD_STATUS_MAP: Readonly<Record<string, SalesStatus>> = {
  'RDV PRIS': SalesStatus.MEETING_SCHEDULED,
  'OPPORTUNITÉ DETECTÉE': SalesStatus.IN_PROGRESS,
  'OPPORTUNITÉ DETECTÉ': SalesStatus.IN_PROGRESS, // the workbook's KPI row spells it without the final e
  'OPPORTUNITÉ ABANDONNÉE': SalesStatus.CLOSED,
};

/** Q2 — étiquette (Leads D) → priority; Chaud also carries the HOT tag. "Tiede" appears unaccented. */
export const ETIQUETTE_MAP: Readonly<Record<string, { priority: Priority; tag?: string }>> = {
  CHAUD: { priority: Priority.HIGH, tag: 'HOT' },
  'TIÈDE': { priority: Priority.NORMAL },
  TIEDE: { priority: Priority.NORMAL },
  FROID: { priority: Priority.LOW },
};

/** §3.3 — Source (Leads C) → LEAD_SOURCE key; composite cells take the first value + warning. */
export const SOURCE_MAP: Readonly<Record<string, string>> = {
  PROSPECTION: 'OUTBOUND',
  'FORMULAIRE SITE WEB': 'WEB_FORM',
  'PLEZI -FORMULAIRE SITE WEB': 'WEB_FORM',
  'PLEZI - FORMULAIRE SITE WEB': 'WEB_FORM',
  'BOUCHE À OREILLE': 'WORD_OF_MOUTH',
  'CAMPAGNE MARKETING': 'MARKETING',
  'APPORTEUR AFFAIRE': 'REFERRAL_PARTNER',
  'APPEL ENTRANT': 'INBOUND_CALL',
  'TRANSFERT LEAD': 'LEAD_TRANSFER',
  PARRAINAGE: 'SPONSORSHIP',
};

/** §3.4 — Éditeur (Leads E) → SOLUTION key (referential seeded, iNoé/Agora/Cosoluce included). */
export const EDITOR_MAP: Readonly<Record<string, string>> = {
  BL: 'BL_ENFANCE',
  'BL-ENFANCE': 'BL_ENFANCE',
  'JVS MAIRISTEM': 'JVS_ENFANCE',
  'JVS MAIRISTEM (EX MODULARIS)': 'JVS_ENFANCE',
  'JVS-PARASCHOOL': 'JVS_ENFANCE',
  MODULARIS: 'JVS_ENFANCE',
  'PAPIER + JVS COMPTA': 'JVS_ENFANCE',
  INOÉ: 'INOE',
  INOE: 'INOE',
  ARPÈGE: 'CONCERTO',
  ARPEGE: 'CONCERTO',
  '3DOUEST': 'PORTAIL_3D_OUEST',
  'AGORA-PLUS': 'AGORA_PLUS',
  COSOLUCE: 'COSOLUCE',
  PAPIER: 'SPREADSHEET',
  'PAPIER -MSG': 'SPREADSHEET',
  RÉGIE: 'SPREADSHEET',
  REGIE: 'SPREADSHEET',
  'NON EQUIPÉE': 'NO_SOFTWARE',
  'NON EQUIPEE': 'NO_SOFTWARE',
  AUTRES: 'OTHER',
};

/** §2.1 — structure type from the name's prefix; anything else is COMMUNE with a warning. */
export const TYPE_PREFIXES: readonly { pattern: RegExp; type: string }[] = [
  { pattern: /^\s*(mairie|commune|ville)\b/i, type: 'COMMUNE' },
  { pattern: /^\s*sivos\b/i, type: 'SIVOS' },
  { pattern: /^\s*sivu\b/i, type: 'SIVU' },
  { pattern: /^\s*sivom\b/i, type: 'SIVOM' },
  { pattern: /^\s*(cc\b|communaut[eé])/i, type: 'EPCI' },
];

/** §3.6 — Commerciaux du classeur → initiales du projet ; the rest are demo values. */
export const SALES_PERSON_MAP: Readonly<Record<string, string>> = {
  'WIEM B.': 'WB',
  'FRED Y.': 'FY',
};

/** Entry A (⚙️ Paramètres) — canonical block names, matched after emoji strip + uppercase. */
export const PARAM_BLOCKS = {
  STATUS: 'STATUT PROSPECTION',
  ETIQUETTES: 'ÉTIQUETTES',
  SOURCES: 'SOURCES',
  EDITORS: 'ÉDITEURS',
  PIPELINE: 'STATUTS PIPELINE',
  WEIGHTS: 'PONDÉRATION',
  SECTORS: 'SECTEURS / INSTANCES',
  ACTIONS: 'ACTIONS / COMMENTAIRES',
  SALES_PEOPLE: 'COMMERCIAUX',
} as const;

/**
 * SPEC-10 §2 — the workbook's weights initialize the project's stage probabilities
 * (per-quote values travel with SPEC-05 Q4 at L2, not here).
 */
export const WEIGHTS_TO_STAGES: Readonly<Record<string, number>> = {
  QUOTE_SENT: 25,
  NEGOTIATING: 60,
  VERBAL_AGREEMENT: 80,
};

/** Entry A secteurs → regions of the geo table; OUEST spans two regions (SPEC-10 §3.3). */
export const SECTOR_REGIONS: Readonly<Record<string, string[]>> = {
  OUEST: ['Bretagne', 'Pays de la Loire'],
  PACA: ["Provence-Alpes-Côte d'Azur"],
};

/** §3.5 — actions of the ⚙️ sheet → ACTIVITY_TYPE keys (entry A validates the vocabulary). */
export const ACTION_MAP: Readonly<Record<string, string>> = {
  'APPEL SORTANT': 'CALL',
  'APPEL ENTRANT': 'CALL',
  'RDV TÉLÉPHONIQUE': 'CALL',
  'EMAIL ENVOYÉ': 'EMAIL',
  'EMAIL REÇU': 'EMAIL',
  'RDV VISIO': 'VIDEO_MEETING',
  'RDV PHYSIQUE': 'MEETING',
  'DÉMONSTRATION': 'DEMO',
  'DEVIS ENVOYÉ': 'EMAIL',
  'RELANCE 1': 'FOLLOW_UP',
  'RELANCE 2': 'FOLLOW_UP',
  'RELANCE 3': 'FOLLOW_UP',
  'NOTE INTERNE': 'NOTE',
  AUTRE: 'NOTE',
};

/** Labels used when entry A must create a SOLUTION value the referential does not know yet. */
export const SOLUTION_LABELS: Readonly<Record<string, string>> = {
  BL_ENFANCE: 'BL Enfance',
  JVS_ENFANCE: 'JVS Enfance',
  INOE: 'iNoé',
  CONCERTO: 'Concerto',
  PORTAIL_3D_OUEST: 'Portail Familles 3D Ouest',
  AGORA_PLUS: 'Agora Plus',
  COSOLUCE: 'Cosoluce',
  SPREADSHEET: 'Excel / papier',
  NO_SOFTWARE: 'Aucun logiciel identifié',
  OTHER: 'Autre solution',
};

/** §4 — contact extraction from the comment (best effort, normative regexes). */
export const CONTACT_PATTERN = /^(M\.|Mme|Mr|Mlle)\s*([A-ZÉÈÀÇ' -]{2,})\s*:/;
export const PHONE_PATTERN = /(\+33|0)\s?\d([ .]?\d{2}){4}/;
