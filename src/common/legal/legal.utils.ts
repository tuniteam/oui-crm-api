import { Prisma } from '@prisma/client';
import { LEGAL_DOCUMENTS, LegalDocument } from './legal.constants';

export interface LegalDocumentInfo {
  code: LegalDocument;
  version: number;
  url: string;
}

/** Current documents, as returned to the front before the consent checkboxes. */
export function listLegalDocuments(): LegalDocumentInfo[] {
  return (Object.keys(LEGAL_DOCUMENTS) as LegalDocument[]).map((code) => ({
    code,
    version: LEGAL_DOCUMENTS[code].version,
    url: LEGAL_DOCUMENTS[code].url,
  }));
}

export interface UserLegalState {
  cguVersion: number | null;
  cguAcceptedAt: Date | null;
  rgpdVersion: number | null;
  rgpdAcceptedAt: Date | null;
}

/**
 * Compare stored consent versions against the current versions in constants.
 * Returns the list of documents whose stored version is missing or outdated.
 *
 * NEVER call this for backoffice users — they are never gated (spec D12).
 * The caller must short-circuit based on the user's role.
 */
export function computeOutdatedLegalDocuments(user: UserLegalState): LegalDocument[] {
  const outdated: LegalDocument[] = [];

  if (user.cguVersion !== LEGAL_DOCUMENTS[LegalDocument.CGU].version) {
    outdated.push(LegalDocument.CGU);
  }

  if (user.rgpdVersion !== LEGAL_DOCUMENTS[LegalDocument.RGPD].version) {
    outdated.push(LegalDocument.RGPD);
  }

  return outdated;
}

/**
 * Stamp the current version + acceptance date for the given documents on the user.
 * Called by:
 *  - the activation transaction (both documents)
 *  - POST /legal/accept (documents the user was asked to re-accept)
 *
 * The version is ALWAYS taken from the server constants — never from the caller
 * (RG5: no payload/URL-driven version). Front and back stay aligned via /profile/me and activation/validate.
 */
export async function stampConsents(
  tx: Prisma.TransactionClient,
  userId: string,
  documents: LegalDocument[],
  now: Date = new Date(),
): Promise<void> {
  if (documents.length === 0) return;

  const data: Prisma.UserUpdateInput = {};

  if (documents.includes(LegalDocument.CGU)) {
    data.cguVersion = LEGAL_DOCUMENTS[LegalDocument.CGU].version;
    data.cguAcceptedAt = now;
  }

  if (documents.includes(LegalDocument.RGPD)) {
    data.rgpdVersion = LEGAL_DOCUMENTS[LegalDocument.RGPD].version;
    data.rgpdAcceptedAt = now;
  }

  await tx.user.update({
    where: { id: userId },
    data,
  });
}
