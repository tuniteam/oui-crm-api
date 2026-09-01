/**
 * French regions → department codes (maquette V8, REGIONS). Static reference served by
 * GET /geo/regions and used to resolve a scope's regions into departments.
 */
export interface GeoRegion {
  name: string;
  departments: string[];
}

export const REGIONS: readonly GeoRegion[] = [
  { name: 'Auvergne-Rhône-Alpes', departments: ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'] },
  { name: 'Bourgogne-Franche-Comté', departments: ['21', '25', '39', '58', '70', '71', '89', '90'] },
  { name: 'Bretagne', departments: ['22', '29', '35', '56'] },
  { name: 'Centre-Val de Loire', departments: ['18', '28', '36', '37', '41', '45'] },
  { name: 'Corse', departments: ['2A', '2B'] },
  { name: 'Grand Est', departments: ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'] },
  { name: 'Hauts-de-France', departments: ['02', '59', '60', '62', '80'] },
  { name: 'Île-de-France', departments: ['75', '77', '78', '91', '92', '93', '94', '95'] },
  { name: 'Normandie', departments: ['14', '27', '50', '61', '76'] },
  { name: 'Nouvelle-Aquitaine', departments: ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'] },
  { name: 'Occitanie', departments: ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'] },
  { name: 'Pays de la Loire', departments: ['44', '49', '53', '72', '85'] },
  { name: "Provence-Alpes-Côte d'Azur", departments: ['04', '05', '06', '13', '83', '84'] },
  { name: 'Outre-mer', departments: ['971', '972', '973', '974', '976'] },
];

const byName = new Map(REGIONS.map((r) => [r.name, r]));

export function findRegion(name: string): GeoRegion | undefined {
  return byName.get(name);
}

/** Regions + explicit departments → deduplicated, sorted department codes. */
export function resolveDepartments(regions: readonly string[], departments: readonly string[]): string[] {
  const set = new Set<string>(departments);
  for (const name of regions) findRegion(name)?.departments.forEach((d) => set.add(d));
  return [...set].sort();
}
