// ============================================
// OUI-CRM - Organization export constants (US-01-07)
// ============================================

/**
 * Hard cap of the SYNCHRONOUS export (decision of 01/09/2026: no job engine at L1 —
 * SPEC-13 phase I). Beyond it the request is refused with 413 EXPORT_TOO_LARGE and an
 * invitation to narrow the filters; the 202 { jobId } of the contract arrives with L2.
 */
export const EXPORT_MAX_ROWS = 2000;

export const EXPORT_FORMATS = ['CSV', 'XLSX'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** French Excel opens `;`-separated UTF-8 CSVs cleanly when they start with a BOM. */
export const CSV_SEPARATOR = ';';
export const CSV_BOM = '﻿';

/** An export is a commercial file leaving the company: journalled with its volume. */
export const EXPORT_AUDIT = { ORGANIZATIONS: 'organization.export' } as const;

/**
 * Exportable columns, in file order — keys are what the `columns` field selects, headers are
 * what a French business user reads. RESTRICTED rows only carry the restricted subset
 * (US-01-01): every other cell stays empty.
 */
export const EXPORT_COLUMNS = [
  { key: 'name', header: 'Nom', restricted: true },
  { key: 'type', header: 'Type', restricted: true },
  { key: 'department', header: 'Département', restricted: true },
  { key: 'city', header: 'Ville', restricted: true },
  { key: 'postalCode', header: 'Code postal', restricted: false },
  { key: 'address', header: 'Adresse', restricted: false },
  { key: 'siret', header: 'SIRET', restricted: false },
  { key: 'inseeCode', header: 'Code INSEE', restricted: false },
  { key: 'population', header: 'Population', restricted: false },
  { key: 'bracketLabel', header: 'Strate', restricted: false },
  { key: 'epci', header: 'EPCI', restricted: false },
  { key: 'salesStatus', header: 'Statut commercial', restricted: true },
  { key: 'customerStatus', header: 'Statut client', restricted: true },
  { key: 'priority', header: 'Priorité', restricted: false },
  { key: 'tags', header: 'Étiquettes', restricted: false },
  { key: 'solution', header: 'Solution en place', restricted: false },
  { key: 'leadSource', header: 'Source', restricted: false },
  { key: 'salesRep', header: 'Commercial', restricted: true },
  { key: 'email', header: 'Email', restricted: false },
  { key: 'phone', header: 'Téléphone', restricted: false },
  { key: 'website', header: 'Site web', restricted: false },
  { key: 'schoolCount', header: "Nombre d'écoles", restricted: false },
  { key: 'childCount', header: "Nombre d'enfants", restricted: false },
  { key: 'services', header: 'Services', restricted: false },
  { key: 'completenessScore', header: 'Complétude (%)', restricted: false },
  { key: 'lastActivityAt', header: 'Dernière action', restricted: false },
  { key: 'nextActivityAt', header: 'Prochaine action', restricted: false },
  { key: 'createdAt', header: 'Créé le', restricted: false },
] as const;
export type ExportColumnKey = (typeof EXPORT_COLUMNS)[number]['key'];
export const EXPORT_COLUMN_KEYS = EXPORT_COLUMNS.map((c) => c.key);
