// ============================================
// OUI-CRM - Official company registry (US-01-02, SPEC-13 D1)
// Two sources behind one endpoint: full-text name search on the open
// recherche-entreprises API, SIRET lookup on the INSEE Sirene API (soft-m ADAPT).
// ============================================

/** Environment keys of the registry module (INSEE ones shared with soft-m). */
export const REGISTRY_ENV = {
  INSEE_API_URL: 'INSEE_API_URL',
  INSEE_API_KEY: 'INSEE_API_KEY',
} as const;

export const REGISTRY = {
  /** Open full-text source — no key, no quota worth throttling at our volume. */
  RECHERCHE_ENTREPRISES_URL: 'https://recherche-entreprises.api.gouv.fr/search',
  /** Same timeout as soft-m insee-api. */
  TIMEOUT_MS: 5_000,
  MAX_RESULTS: 10,
  SIRET_PATTERN: /^\d{14}$/,
  /** Below this length a name search is noise. */
  MIN_QUERY_LENGTH: 3,
  SIRENE_KEY_HEADER: 'X-INSEE-Api-Key-Integration',
} as const;

/** The single output shape of GET /organizations/search-registry (SPEC-07 US-01-02). */
export interface RegistryRow {
  name: string;
  siret: string | null;
  siren: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  inseeCode: string | null;
  department: string | null;
  isActive: boolean;
}
