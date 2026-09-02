import { REGISTRY, RegistryRow } from './registry.constants';

/** A 14-digit query is a SIRET lookup; anything else is a full-text name search (SPEC-13 D1). */
export function isSiretQuery(q: string): boolean {
  return REGISTRY.SIRET_PATTERN.test(q.replace(/\s/g, ''));
}

/** French department from an INSEE commune code (97x overseas, 2A/2B Corsica, else 2 digits). */
export function departmentFromInseeCode(inseeCode?: string | null): string | null {
  if (!inseeCode || inseeCode.length < 2) return null;
  if (inseeCode.startsWith('97') || inseeCode.startsWith('98')) return inseeCode.slice(0, 3);
  const head = inseeCode.slice(0, 2).toUpperCase();
  return head === '2A' || head === '2B' ? head : /^\d{2}$/.test(head) ? head : null;
}

/** Address line from a Sirene établissement block (ADAPT of soft-m buildAddress). */
export function buildSireneAddress(adresse: Record<string, string | null | undefined>): string {
  const parts: string[] = [];
  if (adresse.complementAdresseEtablissement) parts.push(String(adresse.complementAdresseEtablissement));
  const voie = [
    adresse.numeroVoieEtablissement,
    adresse.indiceRepetitionEtablissement,
    adresse.typeVoieEtablissement,
    adresse.libelleVoieEtablissement,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (voie) parts.push(voie);
  return parts.join(', ');
}

/* eslint-disable @typescript-eslint/no-explicit-any -- external API payloads, mapped defensively */

/** One row from the Sirene v3.11 `GET /siret/{siret}` payload. */
export function mapSireneEtablissement(data: any): RegistryRow | null {
  const etab = data?.etablissement;
  if (!etab) return null;
  const adresse = etab.adresseEtablissement ?? {};
  const uniteLegale = etab.uniteLegale ?? {};
  const inseeCode = adresse.codeCommuneEtablissement ?? null;
  return {
    name: uniteLegale.denominationUniteLegale ?? etab.denominationUsuelleEtablissement ?? '',
    siret: etab.siret ?? null,
    siren: etab.siren ?? null,
    address: buildSireneAddress(adresse) || null,
    postalCode: adresse.codePostalEtablissement ?? null,
    city: adresse.libelleCommuneEtablissement ?? null,
    inseeCode,
    department: departmentFromInseeCode(inseeCode),
    isActive: uniteLegale.etatAdministratifUniteLegale === 'A',
  };
}

/** One result from recherche-entreprises.api.gouv.fr `GET /search` (head office fields). */
export function mapRechercheResult(result: any): RegistryRow {
  const siege = result?.siege ?? {};
  const inseeCode = siege.commune ?? null;
  return {
    name: result?.nom_complet ?? result?.nom_raison_sociale ?? '',
    siret: siege.siret ?? null,
    siren: result?.siren ?? null,
    address: siege.adresse ?? null,
    postalCode: siege.code_postal ?? null,
    city: siege.libelle_commune ?? null,
    inseeCode,
    department: departmentFromInseeCode(inseeCode),
    isActive: result?.etat_administratif ? result.etat_administratif === 'A' : true,
  };
}
