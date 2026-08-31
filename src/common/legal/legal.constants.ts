/**
 * Legal documents versions and URLs — single source of truth.
 *
 * Bump the version integer ONLY on a substantive update of the document.
 * The git history of this file is the audit trail ("which version, since when").
 * The URL points to the current published document.
 */

export enum LegalDocument {
  CGU = 'CGU',
  RGPD = 'RGPD',
}

export interface LegalDocumentSpec {
  version: number;
  url: string;
}

/**
 * Placeholder URLs until the platform's CGU/RGPD are published (SPEC-09 T14, SPEC-02 décision 22).
 * Replacing the URL without bumping the version does not re-ask for consent.
 */
export const LEGAL_DOCUMENTS: Record<LegalDocument, LegalDocumentSpec> = {
  [LegalDocument.CGU]: {
    version: 1,
    url: 'https://oui-crm.example/cgu',
  },
  [LegalDocument.RGPD]: {
    version: 1,
    url: 'https://oui-crm.example/rgpd',
  },
};
