import { BillingMode, Prisma, QuoteLineNature } from '@prisma/client';

/**
 * Contrat du moteur tarifaire — SPEC-04 §2. Aucune dépendance à Prisma en dehors du type
 * Decimal : le moteur reçoit tout ce dont il a besoin en paramètre.
 */

// ---------------------------------------------------------------------------
// Grille (PricingGrid.content — SPEC-04 §2.1)
// ---------------------------------------------------------------------------

/** Une strate de population de la grille active. */
export interface PopulationBracket {
  label: string;
  min: number;
  max: number | null;
}

export interface PricingOption {
  id: number;
  name: string;
  /** Prix unitaire mensuel, une valeur par strate. */
  unitPrice: number[];
  /** Quantité comprise dans l'abonnement ; seul le surplus est facturé. */
  included?: number;
}

export interface PricingExtra {
  id: number;
  name: string;
  /** Prix unitaire one-shot, indépendant de la strate. */
  unitPrice: number;
}

/** Poste de frais de mise en place : un libellé et un tableau de prix par formule. */
export type PricingSetupFee = { label: string } & { [plan: string]: string | number[] };

export interface PricingGridContent {
  brackets: PopulationBracket[];
  plans: string[];
  /** Abonnement mensuel par formule, une valeur par strate. */
  subscription: Record<string, number[]>;
  options: PricingOption[];
  setupFees: Record<string, PricingSetupFee>;
  extras: PricingExtra[];
}

// ---------------------------------------------------------------------------
// Configuration d'un devis (Quote.config — SPEC-04 §2.1)
// ---------------------------------------------------------------------------

export interface QuoteOptionConfig {
  id: number;
  qty: number;
  /** Remise de ligne en %, bornée à 0-100. */
  discount: number;
}

export interface QuoteSetupConfig {
  included: boolean;
  discount: number;
}

export type GlobalDiscount =
  | { mode: 'NONE' }
  | { mode: 'PERCENT'; percent: number; months: number }
  | { mode: 'FREE_MONTHS'; months: number };

export type GlobalDiscountMode = GlobalDiscount['mode'];

export interface QuoteConfig {
  /** Clé de `grid.plans`. */
  plan: string;
  subscriptionDiscount: number;
  options: QuoteOptionConfig[];
  /** Clés de `grid.setupFees` : deployment, configuration, training… */
  setup: Record<string, QuoteSetupConfig>;
  extras: QuoteOptionConfig[];
  globalDiscount: GlobalDiscount;
  commitmentMonths: number;
  cancellable: boolean;
  trialClause: boolean;
  billing: BillingMode;
}

export interface QuoteInput {
  /** Version de grille figée sur le devis, ou grille active pour un brouillon. */
  grid: PricingGridContent;
  /** Population de l'organisme : > 0 obligatoire (SPEC-04 déc. 5). */
  population: number | null;
  vatRate: number;
  /** Date de démarrage au format YYYY-MM-DD. */
  startDate: string;
  config: QuoteConfig;
}

// ---------------------------------------------------------------------------
// Résultat (SPEC-04 §2.2)
// ---------------------------------------------------------------------------

/** Ligne calculée, prête à être matérialisée en `QuoteLine` à la soumission (phase F). */
export interface ComputedQuoteLine {
  nature: QuoteLineNature;
  label: string;
  sublabel: string;
  qty: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discount: number;
  total: Prisma.Decimal;
}

export interface QuoteOneShot {
  /** Frais de mise en place hors formation. */
  setup: Prisma.Decimal;
  training: Prisma.Decimal;
  /** Extras : tablettes, prestations. */
  hardware: Prisma.Decimal;
  total: Prisma.Decimal;
}

export interface QuoteFirstYear {
  subscription: Prisma.Decimal;
  totalHt: Prisma.Decimal;
  vat: Prisma.Decimal;
  totalTtc: Prisma.Decimal;
}

export interface QuoteMultiYear {
  years: number[];
  setup: Prisma.Decimal[];
  training: Prisma.Decimal[];
  hardware: Prisma.Decimal[];
  subscription: Prisma.Decimal[];
  /** Nombre de mois d'abonnement facturés dans chaque année civile. */
  months: number[];
  totalHt: Prisma.Decimal[];
  totalTtc: Prisma.Decimal[];
}

export interface QuoteResult {
  bracketIndex: number;
  bracketLabel: string;
  subscriptionUnitPrice: Prisma.Decimal;
  /** Nature ABONNEMENT puis OPTION. */
  subscriptionLines: ComputedQuoteLine[];
  /** Nature SETUP puis EXTRA. */
  setupLines: ComputedQuoteLine[];
  /** Σ des lignes d'abonnement, remises de ligne appliquées, hors remise globale. */
  mrrList: Prisma.Decimal;
  /** MRR « en régime » après remise globale (SPEC-04 §3 règle 6). */
  mrrNet: Prisma.Decimal;
  arrList: Prisma.Decimal;
  arrNet: Prisma.Decimal;
  oneShot: QuoteOneShot;
  /** Montant d'abonnement du mois `monthIndex` (0 = mois de démarrage). */
  monthly: (monthIndex: number) => Prisma.Decimal;
  firstYear: QuoteFirstYear;
  multiYear: QuoteMultiYear;
  /** Remise la plus forte, toutes lignes confondues (SPEC-04 déc. 1). */
  maxDiscount: number;
}
