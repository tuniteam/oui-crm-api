// ============================================
// OUI-CRM - Territory import: pure rules (US-01-14)
// ============================================

import { REGIONS } from '@/scopes/geo.constants';
import { TerritoryItemStatus, TerritorySkipReason } from './import.constants';

/** One commune as geo.api.gouv.fr returns it with COMMUNE_FIELDS. */
export interface GeoCommune {
  nom: string;
  code: string; // code INSEE — the matching key, never the name
  codesPostaux?: string[];
  population?: number;
  codeEpci?: string;
}

export interface TerritoryPlanItem {
  inseeCode: string;
  name: string;
  population: number | null;
  status: TerritoryItemStatus;
  reason?: TerritorySkipReason;
}

/** Every department code a scope can reference — the request is validated against this list. */
export const KNOWN_DEPARTMENTS: ReadonlySet<string> = new Set(REGIONS.flatMap((r) => r.departments));

/** The department is carried by the INSEE code ('89024' → '89', '2A004' → '2A', '97105' → '971'). */
export function departmentOfInsee(inseeCode: string): string {
  return inseeCode.startsWith('97') ? inseeCode.slice(0, 3) : inseeCode.slice(0, 2);
}

/** Population bounds are a selection criterion: communes outside them are not part of the request. */
export function filterByPopulation(
  communes: GeoCommune[],
  minPopulation: number | undefined,
  maxPopulation: number | undefined,
): GeoCommune[] {
  if (minPopulation === undefined && maxPopulation === undefined) return communes;
  return communes.filter((c) => {
    if (c.population === undefined || c.population === null) return false;
    if (minPopulation !== undefined && c.population < minPopulation) return false;
    if (maxPopulation !== undefined && c.population > maxPopulation) return false;
    return true;
  });
}

/** Departments and EPCIs can overlap — one commune is imported once. */
export function dedupeByInsee(communes: GeoCommune[]): GeoCommune[] {
  const seen = new Set<string>();
  return communes.filter((c) => (seen.has(c.code) ? false : (seen.add(c.code), true)));
}

/**
 * Classifies every requested commune against the existing base. Matching is on the INSEE code
 * only (decision D6): an existing record is SKIPPED and none of its fields is overwritten —
 * except `population` when `updatePopulation` is true and the census value differs (UPDATED).
 */
export function planTerritory(
  communes: GeoCommune[],
  existingPopulationByInsee: ReadonlyMap<string, number | null>,
  updatePopulation: boolean,
): TerritoryPlanItem[] {
  return communes.map((c) => {
    const population = c.population ?? null;
    if (!existingPopulationByInsee.has(c.code)) {
      return { inseeCode: c.code, name: c.nom, population, status: 'CREATED' as const };
    }
    const known = existingPopulationByInsee.get(c.code) ?? null;
    if (updatePopulation && population !== null && population !== known) {
      return { inseeCode: c.code, name: c.nom, population, status: 'UPDATED' as const };
    }
    return { inseeCode: c.code, name: c.nom, population, status: 'SKIPPED' as const, reason: 'ALREADY_EXISTS' as const };
  });
}
