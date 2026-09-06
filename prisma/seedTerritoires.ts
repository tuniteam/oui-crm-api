// ============================================
// OUI-CRM — chargement des territoires (SPEC-15 annexe et SPEC-17, 06/09/2026)
//
// Deux familles, deux sources croisées, aucun appel unitaire :
//   • COMMUNE : geo.api.gouv.fr/communes  ×  Annuaire, pivot « mairie »   — 34 969
//   • EPCI    : geo.api.gouv.fr/epcis     ×  Annuaire, pivot « epci »     —  1 255
//
// geo donne l'identité (code INSEE ou SIREN, population, EPCI d'appartenance, coordonnées),
// l'Annuaire donne les coordonnées de contact (SIRET, adresse, téléphone, courriel, horaires).
// Les CCAS sont volontairement absents : 79,4 % partagent le téléphone de leur mairie et aucun
// n'a d'horaires — SPEC-17 §2.
//
// Usage :
//   npx tsx prisma/seedTerritoires.ts --project=periscolia [--types=COMMUNE,EPCI]
//                                     [--reset] [--departments=89,21] [--dry-run]
// ============================================

import {
  FileOwnerType,
  ImportBatchStatus,
  ImportProfile,
  Prisma,
  PrismaClient,
  SalesStatus,
} from '@prisma/client';
import { TERRITORY } from '../src/import/import.constants';
import { departmentOfInsee } from '../src/import/territory.utils';
import { OPENING_DAYS } from '../src/organizations/dto/opening-hours.dto';
import { completenessScore } from '../src/organizations/organizations.utils';

const prisma = new PrismaClient();

const GEO_COMMUNES_URL =
  `${TERRITORY.GEO_API_URL}/communes?fields=nom,code,siren,codesPostaux,population,codeDepartement,epci,mairie,centre`;
const GEO_EPCIS_URL = `${TERRITORY.GEO_API_URL}/epcis?fields=nom,code,type,population,codesDepartements`;
const ANNUAIRE_URL =
  'https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/exports/json' +
  '?where=' +
  encodeURIComponent('pivot like "mairie" or pivot like "epci"') +
  '&select=' +
  encodeURIComponent(
    'nom,siren,siret,code_insee_commune,pivot,telephone,adresse_courriel,site_internet,plage_ouverture,commentaire_plage_ouverture,adresse',
  );

/** Les familles chargeables, et le type de référentiel de chacune. */
const FAMILIES = ['COMMUNE', 'EPCI'] as const;
type Family = (typeof FAMILIES)[number];

/** Type geo d'un EPCI → clé du référentiel. CU et métropoles sous EPCI (SPEC-17 D1). */
const EPCI_TYPE: Record<string, string> = {
  CC: 'EPCI',
  CA: 'AGGLOMERATION',
  CU: 'EPCI',
  METRO: 'EPCI',
  MET69: 'EPCI',
};

/** Un lot par transaction : 35 000 lignes ne tiennent pas dans le budget d'une seule. */
const CHUNK = 2000;
const HTTP_TIMEOUT_MS = 300_000;

/** Les jours de l'Annuaire, traduits vers l'énumération de l'API — une seule liste dans le projet. */
const DAYS: Record<string, string> = Object.fromEntries(
  ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map((fr, i) => [
    fr,
    OPENING_DAYS[i],
  ]),
);
const DAY_ORDER: readonly string[] = OPENING_DAYS;

// ---------------------------------------------------------------------------- types externes

interface GeoCommune {
  nom: string;
  code: string;
  siren?: string;
  codesPostaux?: string[];
  population?: number;
  codeDepartement: string;
  epci?: { nom?: string };
  mairie?: { coordinates?: number[] };
  centre?: { coordinates?: number[] };
}

interface GeoEpci {
  nom: string;
  /** Le code d'un EPCI **est** son SIREN — vérifié : 1 255 nombres à 9 chiffres. */
  code: string;
  type: string;
  population?: number;
  codesDepartements?: string[];
}

interface AnnuaireRow {
  nom?: string;
  siren?: string;
  siret?: string;
  code_insee_commune?: string | string[];
  pivot?: string;
  telephone?: string;
  adresse_courriel?: string;
  site_internet?: string;
  plage_ouverture?: string;
  commentaire_plage_ouverture?: string;
  adresse?: string;
}

interface OpeningSlot {
  nom_jour_debut?: string;
  nom_jour_fin?: string;
  valeur_heure_debut_1?: string;
  valeur_heure_fin_1?: string;
  valeur_heure_debut_2?: string;
  valeur_heure_fin_2?: string;
}

// ---------------------------------------------------------------------------- helpers

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

/** L'Annuaire encode du JSON dans des chaînes : téléphone, site, adresse, horaires, pivot. */
function parseJson<T>(value: unknown): T[] {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const started = Date.now();
  const response = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${label} a répondu ${response.status}`);
  const data = (await response.json()) as T;
  const rows = Array.isArray(data) ? data.length : 0;
  console.log(`  ${label} : ${rows} lignes en ${((Date.now() - started) / 1000).toFixed(1)} s`);
  return data;
}

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Une commune nouvelle porte plusieurs mairies : on garde la principale, pas une annexe. */
function pickTownHall(candidates: AnnuaireRow[], communeName: string): AnnuaireRow {
  if (candidates.length === 1) return candidates[0];
  const exact = candidates.filter((c) => normalize(c.nom ?? '').endsWith(normalize(communeName)));
  const main = (exact.length ? exact : candidates).filter((c) => {
    const name = normalize(c.nom ?? '');
    return !name.includes('annexe') && !name.includes('delegu');
  });
  return (main.length ? main : exact.length ? exact : candidates)[0];
}

/** Les plages sont données par intervalle de jours : on les déplie, jour par jour. */
function openingHours(row: AnnuaireRow | undefined): Prisma.InputJsonValue | undefined {
  if (!row) return undefined;
  const days: { day: string; slots: string[] }[] = [];
  for (const range of parseJson<OpeningSlot>(row.plage_ouverture)) {
    const from = DAYS[range.nom_jour_debut ?? ''];
    const to = DAYS[range.nom_jour_fin ?? ''];
    if (!from) continue;
    const span = to ? DAY_ORDER.slice(DAY_ORDER.indexOf(from), DAY_ORDER.indexOf(to) + 1) : [from];
    const slots = (
      [
        [range.valeur_heure_debut_1, range.valeur_heure_fin_1],
        [range.valeur_heure_debut_2, range.valeur_heure_fin_2],
      ] as [string | undefined, string | undefined][]
    )
      // Une plage dont le début égale la fin est une scorie de la source, pas un créneau.
      .filter(([a, b]) => a && b && a !== b)
      .map(([a, b]) => `${a!.slice(0, 5)}-${b!.slice(0, 5)}`);
    for (const day of span) days.push({ day, slots });
  }
  if (!days.length) return undefined;

  // La source déclare parfois deux plages couvrant le même jour, aux contenus contradictoires
  // (une mairie annonce deux semaines complètes). Les fusionner produirait quatre créneaux qui
  // se chevauchent : on garde une seule entrée par jour, la plus complète, à égalité la
  // première. Le front reçoit ainsi un jour = une entrée, sans arbitrage à faire.
  const byDay = new Map<string, { day: string; slots: string[] }>();
  for (const entry of days) {
    const kept = byDay.get(entry.day);
    if (!kept || entry.slots.length > kept.slots.length) byDay.set(entry.day, entry);
  }
  const ordered = DAY_ORDER.filter((d) => byDay.has(d)).map((d) => byDay.get(d)!);

  const comment = row.commentaire_plage_ouverture;
  return comment ? { days: ordered, comment } : { days: ordered };
}

const firstValue = (row: AnnuaireRow | undefined, field: 'telephone' | 'site_internet'): string | null =>
  (row ? parseJson<{ valeur?: string }>(row[field])[0]?.valeur : null) ?? null;

const addressBlock = (row: AnnuaireRow | undefined): Record<string, string> =>
  (row ? parseJson<Record<string, string>>(row.adresse)[0] : undefined) ?? {};

/** Même composition que buildSireneAddress : compléments puis voie. */
function address(row: AnnuaireRow | undefined): string | null {
  const first = addressBlock(row);
  const parts = [first.complement1, first.complement2, first.numero_voie].map((s) => s?.trim()).filter(Boolean);
  return parts.join(', ').slice(0, 255) || null;
}

const cut = (value: string | null | undefined, max: number): string | null =>
  value ? value.slice(0, max) : null;

const coordinate = (raw: string | undefined): number | null => {
  const n = Number(raw);
  return raw && Number.isFinite(n) ? n : null;
};

/**
 * La règle de complétude est celle de l'API, importée — la réécrire ici la ferait dériver.
 * Calcul en mémoire : aucune requête par ligne. Une fiche fraîche n'a pas de contact.
 */
function completeness(row: Prisma.OrganizationCreateManyInput): number {
  return completenessScore({
    siret: row.siret ?? null,
    address: row.address ?? null,
    postalCode: row.postalCode ?? null,
    population: row.population ?? null,
    email: row.email ?? null,
    hasPrimaryContact: false,
  });
}

/** Le courriel de l'Annuaire porte parfois deux adresses séparées par un point-virgule. */
const firstEmail = (row: AnnuaireRow | undefined): string | null =>
  (row?.adresse_courriel ?? '').split(';')[0].trim() || null;

// ---------------------------------------------------------------------------- programme

async function main(): Promise<void> {
  const slug = arg('project') ?? 'periscolia';
  const dryRun = flag('dry-run');
  const reset = flag('reset');
  const departments = arg('departments')?.split(',').map((d) => d.trim()).filter(Boolean);
  const types = (arg('types')?.split(',').map((t) => t.trim().toUpperCase()) ?? [...FAMILIES]) as Family[];
  const unknown = types.filter((t) => !FAMILIES.includes(t));
  if (unknown.length) throw new Error(`Famille inconnue : ${unknown.join(', ')} (attendu : ${FAMILIES.join(', ')})`);

  const project = await prisma.project.findFirst({ where: { slug }, select: { id: true, name: true } });
  if (!project) throw new Error(`Projet "${slug}" introuvable`);

  const author = await prisma.userRoleProject.findFirst({
    where: { projectId: project.id },
    select: { userId: true },
  });
  if (!author) throw new Error("Aucun membre sur le projet : le lot d'import a besoin d'un auteur");

  // Le type de structure et son préfixe viennent du référentiel du projet, jamais du code.
  const referenceKeys = [...new Set(types.flatMap((t) => (t === 'COMMUNE' ? [TERRITORY.STRUCTURE_TYPE] : Object.values(EPCI_TYPE))))];
  const references = await prisma.referenceItem.findMany({
    where: { projectId: project.id, category: 'STRUCTURE_TYPE', key: { in: referenceKeys }, active: true },
    select: { key: true, metadata: true },
  });
  const missing = referenceKeys.filter((k) => !references.some((r) => r.key === k));
  if (missing.length) throw new Error(`Le référentiel STRUCTURE_TYPE du projet ignore : ${missing.join(', ')}`);
  const prefixOf = new Map(
    references.map((r) => {
      const p = (r.metadata as { prefix?: unknown } | null)?.prefix;
      return [r.key, typeof p === 'string' && p.trim() ? p : null];
    }),
  );

  console.log(`\nProjet ${project.name} (${slug}) — familles ${types.join(', ')}${dryRun ? ' — SIMULATION' : ''}`);

  // ---------------------------------------------------------------- 1. les sources
  console.log('\n1. Téléchargement');
  const wantCommunes = types.includes('COMMUNE');
  const wantEpcis = types.includes('EPCI');
  const [communes, epcis, annuaire] = await Promise.all([
    wantCommunes ? fetchJson<GeoCommune[]>(GEO_COMMUNES_URL, 'geo — communes') : Promise.resolve([]),
    wantEpcis ? fetchJson<GeoEpci[]>(GEO_EPCIS_URL, 'geo — EPCI') : Promise.resolve([]),
    fetchJson<AnnuaireRow[]>(ANNUAIRE_URL, "Annuaire de l'administration"),
  ]);

  // ---------------------------------------------------------------- 2. jointures
  console.log('\n2. Jointures');
  const pivotOf = (row: AnnuaireRow): string[] =>
    parseJson<{ type_service_local?: string }>(row.pivot).map((p) => p.type_service_local ?? '');

  const townHalls = new Map<string, AnnuaireRow[]>();
  const epciBySiren = new Map<string, AnnuaireRow>();
  for (const row of annuaire) {
    const pivots = pivotOf(row);
    if (pivots.includes('epci')) {
      if (row.siren) epciBySiren.set(row.siren, row);
      continue;
    }
    const raw = row.code_insee_commune;
    for (const code of Array.isArray(raw) ? raw : raw ? [raw] : []) {
      const list = townHalls.get(code);
      if (list) list.push(row);
      else townHalls.set(code, [row]);
    }
  }
  const communeByInsee = new Map(communes.map((c) => [c.code, c]));

  const rows: Prisma.OrganizationCreateManyInput[] = [];

  // --- les communes
  const selectedCommunes = departments?.length
    ? communes.filter((c) => departments.includes(c.codeDepartement))
    : communes;
  for (const commune of selectedCommunes) {
    const candidates = townHalls.get(commune.code);
    const hall = candidates?.length ? pickTownHall(candidates, commune.nom) : undefined;
    const [longitude, latitude] = commune.mairie?.coordinates ?? commune.centre?.coordinates ?? [];
    const row: Prisma.OrganizationCreateManyInput = {
      projectId: project.id,
      name: cut(commune.nom, 200)!,
      type: TERRITORY.STRUCTURE_TYPE,
      displayPrefix: prefixOf.get(TERRITORY.STRUCTURE_TYPE) ?? null,
      inseeCode: commune.code,
      department: commune.codeDepartement,
      city: cut(commune.nom, 120),
      postalCode: cut(commune.codesPostaux?.[0], 10),
      population: commune.population ?? null,
      epci: cut(commune.epci?.nom, 150),
      siren: commune.siren ?? null,
      siret: hall?.siret ?? null,
      address: address(hall),
      phone: cut(firstValue(hall, 'telephone'), 20),
      email: cut(firstEmail(hall), 255),
      website: cut(firstValue(hall, 'site_internet'), 255),
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      salesStatus: SalesStatus.NOT_CONTACTED,
      completenessScore: 0,
    };
    const hours = openingHours(hall);
    if (hours) row.openingHours = hours;
    row.completenessScore = completeness(row);
    rows.push(row);
  }

  // --- les EPCI : rapprochés sur le SIREN, jamais sur le nom (SPEC-17 §3)
  for (const epci of epcis) {
    const hall = epciBySiren.get(epci.code);
    const seatInsee = Array.isArray(hall?.code_insee_commune)
      ? hall?.code_insee_commune[0]
      : hall?.code_insee_commune;
    // Le département est celui du siège ; repli sur le premier couvert (SPEC-17 §5).
    const department = (seatInsee ? departmentOfInsee(seatInsee) : '') || epci.codesDepartements?.[0] || '';
    if (departments?.length && !departments.includes(department)) continue;
    if (!department) continue;

    const type = EPCI_TYPE[epci.type] ?? 'EPCI';
    const block = addressBlock(hall);
    const row: Prisma.OrganizationCreateManyInput = {
      projectId: project.id,
      name: cut(epci.nom, 200)!,
      type,
      displayPrefix: prefixOf.get(type) ?? null,
      // Un EPCI n'a pas de code INSEE : celui du siège appartient à la commune (SPEC-17 §4).
      inseeCode: null,
      department,
      city: cut(seatInsee ? communeByInsee.get(seatInsee)?.nom ?? block.nom_commune : block.nom_commune, 120),
      postalCode: cut(block.code_postal, 10),
      population: epci.population ?? null,
      // Un EPCI n'appartient pas à un EPCI.
      epci: null,
      siren: epci.code,
      siret: hall?.siret ?? null,
      address: address(hall),
      phone: cut(firstValue(hall, 'telephone'), 20),
      email: cut(firstEmail(hall), 255),
      website: cut(firstValue(hall, 'site_internet'), 255),
      latitude: coordinate(block.latitude),
      longitude: coordinate(block.longitude),
      salesStatus: SalesStatus.NOT_CONTACTED,
      completenessScore: 0,
    };
    const hours = openingHours(hall);
    if (hours) row.openingHours = hours;
    row.completenessScore = completeness(row);
    rows.push(row);
  }

  // Un même SIRET ne peut pas être porté par deux fiches : l'unicité (project_id, siret) le
  // refuse. Le cas arrive quand une mairie sert plusieurs codes INSEE (communes nouvelles).
  // Le porteur légitime est celui dont le SIREN ouvre le SIRET ; les autres perdent le SIRET,
  // pas le reste — téléphone et horaires ne sont pas uniques.
  const bySiret = new Map<string, Prisma.OrganizationCreateManyInput[]>();
  for (const row of rows) {
    if (!row.siret) continue;
    const list = bySiret.get(row.siret);
    if (list) list.push(row);
    else bySiret.set(row.siret, [row]);
  }
  let siretCleared = 0;
  for (const [siret, sharing] of bySiret) {
    if (sharing.length < 2) continue;
    const keeper = sharing.find((r) => r.siren && siret.startsWith(r.siren)) ?? sharing[0];
    for (const row of sharing) {
      if (row === keeper) continue;
      row.siret = null;
      row.completenessScore = completeness(row);
      siretCleared += 1;
    }
  }
  if (siretCleared) console.log(`  SIRET partagés par plusieurs fiches, effacés : ${siretCleared}`);

  const byType = new Map<string, number>();
  for (const r of rows) byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
  console.log(`  ${rows.length} fiches${departments ? ` (départements ${departments.join(', ')})` : ''}`);
  for (const [t, n] of byType) console.log(`    ${t.padEnd(15)} ${n}`);

  // Ce que chaque champ reçoit vraiment : la couverture se constate, elle ne se déclare pas.
  const FIELDS = [
    'population', 'postalCode', 'department', 'epci', 'siren', 'siret',
    'address', 'phone', 'email', 'website', 'openingHours', 'latitude', 'longitude',
  ] as const;
  console.log('\n  Couverture par champ');
  for (const field of FIELDS) {
    const n = rows.filter((r) => {
      const v = (r as Record<string, unknown>)[field];
      return v !== null && v !== undefined && v !== '';
    }).length;
    console.log(`    ${field.padEnd(13)} ${String(n).padStart(6)} / ${rows.length}  ${((100 * n) / rows.length).toFixed(1).padStart(5)} %`);
  }
  const avg = rows.reduce((sum, r) => sum + (r.completenessScore ?? 0), 0) / rows.length;
  console.log(`    complétude moyenne : ${avg.toFixed(0)} %`);

  // ---------------------------------------------------------------- 3. remise à zéro
  if (reset) {
    const held = await prisma.organization.count({
      where: {
        projectId: project.id,
        OR: [{ quotes: { some: {} } }, { contracts: { some: {} } }, { opportunities: { some: {} } }],
      },
    });
    // Les documents joints ne sont reliés par aucune clé étrangère : ils se comptent à part.
    const withFiles = await prisma.file.count({
      where: { projectId: project.id, ownerType: FileOwnerType.ORGANIZATION },
    });
    if (held + withFiles > 0) {
      throw new Error(
        `${held} fiche(s) portent un devis, un contrat ou une opportunité et ${withFiles} document(s) sont joints : reset refusé (SPEC-15 §3.1)`,
      );
    }
    const before = await prisma.organization.count({ where: { projectId: project.id } });
    console.log(`\n3. Remise à zéro — ${before} fiches et leurs contacts, activités et ciblages`);
    if (!dryRun) {
      const { count } = await prisma.organization.deleteMany({ where: { projectId: project.id } });
      console.log(`  supprimées : ${count}`);
    }
  }

  // ---------------------------------------------------------------- 4. insertion
  // Le rapprochement se fait sur le code INSEE pour les communes, sur le SIREN pour les EPCI.
  const existing = await prisma.organization.findMany({
    where: { projectId: project.id },
    select: { inseeCode: true, siren: true, type: true },
  });
  const knownInsee = new Set(existing.map((o) => o.inseeCode).filter((c): c is string => !!c));
  const knownSiren = new Set(
    existing.filter((o) => !o.inseeCode).map((o) => o.siren).filter((s): s is string => !!s),
  );
  const todo = rows.filter((r) => (r.inseeCode ? !knownInsee.has(r.inseeCode) : !knownSiren.has(r.siren ?? '')));
  console.log(`\n${reset ? '4' : '3'}. Insertion — ${todo.length} à créer, ${rows.length - todo.length} déjà présentes`);

  if (dryRun) {
    console.log("  SIMULATION : rien n'a été écrit");
    return;
  }

  const batch = await prisma.importBatch.create({
    data: {
      projectId: project.id,
      profile: ImportProfile.TERRITORY,
      status: ImportBatchStatus.APPLIED,
      totals: { created: todo.length, updated: 0, skipped: rows.length - todo.length, errors: 0 },
      createdBy: author.userId,
    },
    select: { id: true },
  });

  const started = Date.now();
  let created = 0;
  for (let i = 0; i < todo.length; i += CHUNK) {
    const slice = todo.slice(i, i + CHUNK).map((r) => ({ ...r, importBatchId: batch.id }));
    const { count } = await prisma.organization.createMany({ data: slice });
    created += count;
    process.stdout.write(`\r  ${created}/${todo.length} créées…`);
  }
  console.log(`\r  ${created} fiches créées en ${((Date.now() - started) / 1000).toFixed(1)} s — lot ${batch.id}`);
}

main()
  .catch((error) => {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
