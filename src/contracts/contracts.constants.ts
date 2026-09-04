// ============================================
// OUI-CRM - Contracts constants (US-02-07, US-02-10)
// ============================================

import { ContractStatus, QuoteType } from '@prisma/client';

/** Actions du journal (AUDIT_OBJECTS.CONTRACT). */
export const CONTRACTS_AUDIT = {
  CREATE: 'contract.create',
  AMEND: 'contract.amend',
  RELEASE: 'contract.release',
  CLOSE: 'contract.close',
} as const;

/**
 * Seul un contrat en cours s'amende (SPEC-14 D16). Un avenant d'avenant n'existe pas tant que
 * le premier n'a pas abouti : ou il est signé — le contrat est alors remplacé — ou il meurt, et
 * le contrat revient `ACTIVE`.
 */
export const AMENDABLE_STATUSES: readonly ContractStatus[] = [ContractStatus.ACTIVE];

/** Les deux types de devis qu'un avenant produit ; `INITIAL` n'amende rien. */
export const AMENDMENT_QUOTE_TYPES: readonly QuoteType[] = [QuoteType.RENEWAL, QuoteType.ADDITIONAL];

/**
 * Un additionnel s'ajoute à un service déjà déployé : les frais de mise en place ne sont pas
 * refacturés (US-02-10). Le commercial peut les remettre à la main sur le brouillon.
 */
export const ADDITIONAL_INCLUDES_SETUP = false;

/** Longueur maximale d'un numéro de contrat, alignée sur le schéma. */
export const CONTRACT_NUMBER_MAX_LENGTH = 30;
