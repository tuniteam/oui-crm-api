import { DocumentTemplateType } from '@prisma/client';
import { DEFAULT_STAGE_PROBABILITIES } from '@/projects/project-config.constants';

/** Audit actions written by the settings module (SPEC-02 §4.3). */
export const SETTINGS_AUDIT = {
  UPDATE: 'settings.update',
  TEMPLATE_UPLOAD: 'template.upload',
  SIGNATURE_UPDATE: 'signatureImage.update',
  SIGNATURE_DELETE: 'signatureImage.delete',
} as const;

export const PERCENT_MAX = 100;
export const AMOUNT_DECIMALS = 2;

/** Pipeline stages carrying a probability — keys of the Settings.stageProbabilities JSON. */
export const STAGE_KEYS: readonly string[] = Object.keys(DEFAULT_STAGE_PROBABILITIES);
/** Stages whose probability never changes (SPEC-10 §2). */
export const FIXED_STAGE_PROBABILITIES: Readonly<Record<string, number>> = { WON: 100, LOST: 0 };

/** Company identity printed on quotes and contracts (Settings.company JSON, SPEC-01 §6.4). */
export const COMPANY_FIELDS = ['name', 'siren', 'siret', 'rcs', 'address', 'phone', 'email', 'signatory'] as const;
export type CompanyField = (typeof COMPANY_FIELDS)[number];
export const COMPANY_FIELD_MAX_LENGTH = 150;
/** 9 / 14 digits, optional spaces between groups as printed on official documents. */
export const SIREN_PATTERN = /^\d{3} ?\d{3} ?\d{3}$/;
export const SIRET_PATTERN = /^\d{3} ?\d{3} ?\d{3} ?\d{5}$/;

/** Tag receiving the project's stamp + signature image as a data URI (SPEC-02 §5.3). */
export const SIGNATURE_IMAGE_TAG = 'signature_image';
/** Handlebars tags a template must reference to be accepted (subset of SPEC-01 §6.2 / §6.3). */
export const REQUIRED_TEMPLATE_TAGS: Record<DocumentTemplateType, readonly string[]> = {
  QUOTE: [
    'mairie_nom',
    'mairie_adresse',
    'ref_devis',
    'date_emission',
    'date_validite',
    'formule',
    'lignes_abo',
    'lignes_frais',
    'total_ht_abo',
    'total_ttc_abo',
    'signataire_periscolia',
    SIGNATURE_IMAGE_TAG,
  ],
  CONTRACT: [
    'mairie_nom',
    'mairie_adresse',
    'ref_contrat',
    'date_signature',
    'date_demarrage',
    'engagement_txt',
    'conditions_contrat_txt',
    'resiliation_contrat_txt',
    'representant_nom',
    'signataire_periscolia',
    SIGNATURE_IMAGE_TAG,
  ],
};

/** Formats de numérotation : `NUMBERING` vit avec le formateur unique
 *  (`@/common/utils/document-number.utils`), réexporté ici pour les consommateurs du module. */
export { NUMBERING } from '@/common/utils/document-number.utils';
