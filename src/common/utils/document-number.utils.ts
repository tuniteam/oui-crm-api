import { DocumentType, PrismaClient } from '@prisma/client';
import { apiError } from '@/common/api-error';
import { MS_PER_DAY, todayUtc } from './date.utils';

/**
 * Numérotation des documents (SPEC-01 §4.3) — **seule** implémentation du format :
 *   devis    `DEV-{année}-{quantième}-{initiales}{séquence sur 3}` — ex. DEV-2026-243-WB001
 *   contrat  numéro du devis, `DEV` → `CTR`
 *   facture  `FAC-{année}-{séquence sur 4}`                       — ex. FAC-2026-0001
 *
 * Les réglages (`GET /settings`) montrent au front un **exemple** de ces numéros : ils
 * appellent les mêmes fonctions, pour que l'exemple annoncé et le numéro émis ne puissent
 * pas diverger.
 *
 * La séquence est portée par `DocumentNumberSequence`, dont `periodKey` est un VarChar(10) :
 * elle est **quotidienne par projet** pour les devis (clé `2026-243`) et **annuelle** pour les
 * factures (clé `2026`). Les initiales identifient l'auteur, elles ne segmentent pas le
 * compteur — deux commerciaux qui émettent le même jour se partagent la suite.
 */

/** Formats fixes, exposés au front comme exemples (SPEC-01 §4.3). */
export const NUMBERING = {
  QUOTE_PREFIX: 'DEV',
  CONTRACT_PREFIX: 'CTR',
  INVOICE_PREFIX: 'FAC',
  DAY_OF_YEAR_WIDTH: 3,
  DAILY_SEQUENCE_WIDTH: 3,
  YEARLY_SEQUENCE_WIDTH: 4,
  FALLBACK_INITIALS: 'XX',
} as const;

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

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

/** Quantième du jour dans son année, 1 au 1er janvier (UTC, jamais l'heure locale). */
export function dayOfYear(day: Date): number {
  const startOfYear = Date.UTC(day.getUTCFullYear(), 0, 0);
  return Math.floor((day.getTime() - startOfYear) / MS_PER_DAY);
}

/** `DEV-{année}-{quantième}-{initiales}{séquence}`. */
export function quoteNumber(day: Date, initials: string, sequence: number): string {
  const dayPart = pad(dayOfYear(day), NUMBERING.DAY_OF_YEAR_WIDTH);
  const rank = pad(sequence, NUMBERING.DAILY_SEQUENCE_WIDTH);
  return `${NUMBERING.QUOTE_PREFIX}-${day.getUTCFullYear()}-${dayPart}-${initials.toUpperCase()}${rank}`;
}

/** Numéro de contrat = numéro du devis signé, `DEV` → `CTR` (SPEC-01 §3.9). */
export function contractNumber(quoteRef: string): string {
  return NUMBERING.CONTRACT_PREFIX + quoteRef.slice(NUMBERING.QUOTE_PREFIX.length);
}

/** `FAC-{année}-{séquence sur 4}`. */
export function invoiceNumber(day: Date, sequence: number): string {
  return `${NUMBERING.INVOICE_PREFIX}-${day.getUTCFullYear()}-${pad(sequence, NUMBERING.YEARLY_SEQUENCE_WIDTH)}`;
}

/** Clé de période de la séquence : `YYYY-DDD` au jour (devis), `YYYY` à l'année (factures). */
export function periodKeyOf(type: DocumentType, day: Date): string {
  const year = day.getUTCFullYear();
  if (type === DocumentType.INVOICE) return String(year);
  return `${year}-${pad(dayOfYear(day), NUMBERING.DAY_OF_YEAR_WIDTH)}`;
}

/** Numéro complet à partir d'un rang de séquence. Fonction pure, testée sans base. */
export function formatDocumentNumber(request: DocumentNumberRequest & { day: Date }, sequence: number): string {
  const { type, day, initials } = request;
  if (type === DocumentType.INVOICE) return invoiceNumber(day, sequence);
  if (!initials) throw apiError.badRequest('DOCUMENT_NUMBER_INITIALS_REQUIRED');
  return quoteNumber(day, initials, sequence);
}

/**
 * Réserve `count` numéros consécutifs et les renvoie dans l'ordre. À appeler dans la
 * transaction de création du document : le rang est consommé même si la transaction échoue,
 * ce qui laisse un trou dans la suite mais jamais un doublon — le bon compromis pour un
 * numéro de document commercial.
 *
 * L'atomicité vient de la base : l'`upsert` porte sur une clé unique, donc Postgres l'exécute
 * en `INSERT … ON CONFLICT DO UPDATE`. Un `P2002` ne peut pas être rattrapé ici — dans une
 * transaction déjà avortée, toute requête suivante échoue — il remonte donc à l'appelant, à
 * qui il revient de rejouer sa transaction.
 */
export async function nextDocumentNumbers(db: SequenceDb, request: DocumentNumberRequest): Promise<string[]> {
  const { projectId, type, count = 1 } = request;
  const day = request.day ?? todayUtc();
  const periodKey = periodKeyOf(type, day);

  // Le numéro est calculé avant l'écriture pour rejeter des initiales manquantes sans
  // consommer de rang.
  formatDocumentNumber({ ...request, day }, 1);

  const row = await db.documentNumberSequence.upsert({
    where: { projectId_type_periodKey: { projectId, type, periodKey } },
    create: { projectId, type, periodKey, lastNumber: count },
    update: { lastNumber: { increment: count } },
    select: { lastNumber: true },
  });

  const first = row.lastNumber - count + 1;
  return Array.from({ length: count }, (_, i) => formatDocumentNumber({ ...request, day }, first + i));
}
