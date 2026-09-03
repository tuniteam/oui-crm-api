import { DocumentType, PrismaClient } from '@prisma/client';
import { apiError } from '@/common/api-error';
import { MS_PER_DAY, todayUtc } from './date.utils';
import { isUniqueViolation } from './prisma.utils';

/**
 * Numérotation des documents (SPEC-01 §4.3) :
 *   devis   `DEV-{année}-{quantième}-{initiales}{séquence sur 3}` — ex. DEV-2026-243-WB001
 *   facture `FAC-{année}-{séquence sur 4}`                        — ex. FAC-2026-0001
 *
 * La séquence est portée par `DocumentNumberSequence`, dont `periodKey` est un VarChar(10) :
 * elle est **quotidienne par projet** pour les devis (clé `2026-243`) et **annuelle** pour les
 * factures (clé `2026`). Les initiales identifient l'auteur, elles ne segmentent pas le
 * compteur — deux commerciaux qui émettent le même jour se partagent la suite.
 *
 * L'attribution se fait par un seul `update { increment: count }` puis calcul en mémoire
 * (convention §9 du skill) : deux devis créés à la même milliseconde ne peuvent pas porter le
 * même numéro.
 */

const DOCUMENT_PREFIX: Record<DocumentType, string> = {
  [DocumentType.QUOTE]: 'DEV',
  [DocumentType.INVOICE]: 'FAC',
};

const SEQUENCE_PAD: Record<DocumentType, number> = {
  [DocumentType.QUOTE]: 3,
  [DocumentType.INVOICE]: 4,
};

const DAY_OF_YEAR_PAD = 3;

type SequenceDb = Pick<PrismaClient, 'documentNumberSequence'>;

export interface DocumentNumberRequest {
  projectId: string;
  type: DocumentType;
  /** Initiales de l'auteur (`UserRoleProject.initials`) — obligatoires pour un devis. */
  initials?: string | null;
  /** Jour d'émission, minuit UTC. Défaut : aujourd'hui. */
  day?: Date;
  /** Nombre de numéros consécutifs à réserver (import de reprise). Défaut : 1. */
  count?: number;
}

/** Quantième du jour dans son année, 1 au 1er janvier (UTC, jamais l'heure locale). */
export function dayOfYear(day: Date): number {
  const startOfYear = Date.UTC(day.getUTCFullYear(), 0, 0);
  return Math.floor((day.getTime() - startOfYear) / MS_PER_DAY);
}

/** Clé de période de la séquence : `YYYY-DDD` au jour (devis), `YYYY` à l'année (factures). */
export function periodKeyOf(type: DocumentType, day: Date): string {
  const year = day.getUTCFullYear();
  if (type === DocumentType.INVOICE) return String(year);
  return `${year}-${String(dayOfYear(day)).padStart(DAY_OF_YEAR_PAD, '0')}`;
}

/** Numéro complet à partir d'un rang de séquence. Fonction pure, testée sans base. */
export function formatDocumentNumber(request: DocumentNumberRequest & { day: Date }, sequence: number): string {
  const { type, day, initials } = request;
  const rank = String(sequence).padStart(SEQUENCE_PAD[type], '0');
  const prefix = DOCUMENT_PREFIX[type];
  if (type === DocumentType.INVOICE) return `${prefix}-${day.getUTCFullYear()}-${rank}`;
  if (!initials) throw apiError.badRequest('DOCUMENT_NUMBER_INITIALS_REQUIRED');
  return `${prefix}-${periodKeyOf(type, day)}-${initials.toUpperCase()}${rank}`;
}

/**
 * Réserve `count` numéros consécutifs et les renvoie dans l'ordre. À appeler dans la
 * transaction de création du document : le rang est consommé même si la transaction échoue,
 * ce qui laisse un trou dans la suite mais jamais un doublon — le bon compromis pour un
 * numéro de document commercial.
 */
export async function nextDocumentNumbers(db: SequenceDb, request: DocumentNumberRequest): Promise<string[]> {
  const { projectId, type, count = 1 } = request;
  const day = request.day ?? todayUtc();
  const periodKey = periodKeyOf(type, day);

  // Le numéro est calculé avant l'écriture pour rejeter des initiales manquantes sans
  // consommer de rang.
  formatDocumentNumber({ ...request, day }, 1);

  const last = await reserve(db, { projectId, type, periodKey, count });
  const first = last - count + 1;
  return Array.from({ length: count }, (_, i) => formatDocumentNumber({ ...request, day }, first + i));
}

/** Réservation atomique du rang. Sur la toute première du jour, deux transactions peuvent
 *  vouloir créer la ligne de séquence : le perdant se contente d'incrémenter celle du gagnant. */
async function reserve(
  db: SequenceDb,
  key: { projectId: string; type: DocumentType; periodKey: string; count: number },
): Promise<number> {
  const { projectId, type, periodKey, count } = key;
  const where = { projectId_type_periodKey: { projectId, type, periodKey } };
  try {
    const row = await db.documentNumberSequence.upsert({
      where,
      create: { projectId, type, periodKey, lastNumber: count },
      update: { lastNumber: { increment: count } },
      select: { lastNumber: true },
    });
    return row.lastNumber;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const row = await db.documentNumberSequence.update({
      where,
      data: { lastNumber: { increment: count } },
      select: { lastNumber: true },
    });
    return row.lastNumber;
  }
}
