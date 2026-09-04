import { Contract, ContractStatus, Prisma, PrismaClient, Quote, QuoteType } from '@prisma/client';
import { apiError } from '@/common/api-error';
import { addMonths, nextDay } from '@/common/utils/date.utils';
import { contractNumber } from '@/common/utils/document-number.utils';
import { QuoteConfig } from '@/pricing/pricing.types';
import { ADDITIONAL_INCLUDES_SETUP, AMENDABLE_STATUSES } from './contracts.constants';

type Db = Pick<PrismaClient, 'contract'> | Prisma.TransactionClient;

/** Le devis signé, tel que la création d'un contrat a besoin de le connaître. */
export type SignedQuote = Pick<
  Quote,
  | 'id'
  | 'projectId'
  | 'organizationId'
  | 'number'
  | 'startDate'
  | 'config'
  | 'mrrList'
  | 'mrrNet'
  | 'arrList'
  | 'arrNet'
  | 'oneShotTotal'
  | 'sourceContractId'
>;

/** Seul un contrat `ACTIVE` s'amende (D16). */
export function assertAmendable(contract: Pick<Contract, 'status'>): void {
  if (!AMENDABLE_STATUSES.includes(contract.status)) {
    throw apiError.conflict('CONTRACT_NOT_AMENDABLE', contract.status);
  }
}

/**
 * Le contrat né d'une signature (D1). Les montants sont **copiés** du devis figé, jamais
 * recalculés : un contrat doit dire ce qui a été signé, même si la grille change le lendemain.
 * `endDate` se déduit de l'engagement, `noticeMonths` des réglages du projet, `autoRenew` du
 * défaut du modèle (D15).
 */
export function contractData(
  quote: SignedQuote,
  config: QuoteConfig,
  signedAt: Date,
  noticeMonths: number,
): Prisma.ContractUncheckedCreateInput {
  return {
    projectId: quote.projectId,
    quoteId: quote.id,
    organizationId: quote.organizationId,
    number: contractNumber(quote.number),
    signedAt,
    startDate: quote.startDate,
    commitmentMonths: config.commitmentMonths,
    endDate: addMonths(quote.startDate, config.commitmentMonths),
    noticeMonths,
    billing: config.billing,
    plan: config.plan,
    mrrList: quote.mrrList,
    mrrNet: quote.mrrNet,
    arrList: quote.arrList,
    arrNet: quote.arrNet,
    oneShotTotal: quote.oneShotTotal,
    trialClause: config.trialClause,
    status: ContractStatus.ACTIVE,
    sourceContractId: quote.sourceContractId,
  };
}

/**
 * La configuration du devis d'avenant, tirée de celle du contrat en cours.
 *
 * `RENEWAL` reconduit le service tel quel ; `ADDITIONAL` ajoute des postes à un service déjà
 * déployé, donc **sans frais de mise en place** (US-02-10) — le commercial peut les remettre sur
 * le brouillon si le cas s'y prête.
 */
export function amendmentConfig(config: QuoteConfig, type: QuoteType): QuoteConfig {
  if (type !== QuoteType.ADDITIONAL) return config;
  return {
    ...config,
    setup: Object.fromEntries(
      Object.entries(config.setup).map(([key, entry]) => [key, { ...entry, included: ADDITIONAL_INCLUDES_SETUP }]),
    ),
  };
}

/**
 * Le jour où démarre le devis d'avenant : un renouvellement prend la suite du contrat, au
 * lendemain de sa fin. Un additionnel démarre comme n'importe quel devis (défaut de la phase E).
 */
export function amendmentStartDate(contract: Pick<Contract, 'endDate'>, type: QuoteType): Date | null {
  return type === QuoteType.RENEWAL ? nextDay(contract.endDate) : null;
}

/**
 * **Writer unique du statut d'un contrat.** Comme `applyQuoteStatus` et `applySalesStatus` : une
 * seule écriture, portée par le projet, et un 404 si le contrat n'est pas celui qu'on croit.
 */
export async function applyContractStatus(
  tx: Db,
  projectId: string,
  contract: Pick<Contract, 'id' | 'status'>,
  to: ContractStatus,
): Promise<{ from: ContractStatus; to: ContractStatus } | null> {
  if (contract.status === to) return null;
  const { count } = await tx.contract.updateMany({
    where: { id: contract.id, projectId },
    data: { status: to },
  });
  if (count === 0) throw apiError.notFound('CONTRACT_NOT_FOUND', contract.id);
  return { from: contract.status, to };
}

/**
 * Un avenant qui meurt — devis refusé, expiré ou brouillon supprimé — rend le contrat à sa vie
 * normale. Sans ce chemin, un contrat resterait `AMENDING` pour toujours (SPEC-14 D16).
 */
export async function releaseAmendedContract(
  tx: Db,
  projectId: string,
  sourceContractId: string | null,
): Promise<{ id: string; from: ContractStatus; to: ContractStatus } | null> {
  if (!sourceContractId) return null;
  const { count } = await tx.contract.updateMany({
    where: { id: sourceContractId, projectId, status: ContractStatus.AMENDING },
    data: { status: ContractStatus.ACTIVE },
  });
  return count === 0
    ? null
    : { id: sourceContractId, from: ContractStatus.AMENDING, to: ContractStatus.ACTIVE };
}
