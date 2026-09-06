// ============================================
// OUI-CRM — chargement des communes de France (SPEC-15 annexe, 06/09/2026)
//
// Deux téléchargements en bloc, une jointure en mémoire, une insertion par lots. Aucun appel
// unitaire : les 34 969 communes tiennent en deux requêtes HTTP.
//   • geo.api.gouv.fr        → code INSEE, nom, population, EPCI, codes postaux, coordonnées
//   • api-lannuaire.service-public.fr → SIRET, adresse, téléphone, courriel, site, horaires
//
// Usage :
//   npx tsx prisma/seedCommunes.ts --project=periscolia [--reset] [--departments=89,21] [--dry-run]
// ============================================

import { FileOwnerType, ImportBatchStatus, ImportProfile, Prisma, PrismaClient, SalesStatus } from '@prisma/client';
import { TERRITORY } from '../src/import/import.constants';
import { OPENING_DAYS } from '../src/organizations/dto/opening-hours.dto';
import { completenessScore } from '../src/organizations/organizations.utils';

const prisma = new PrismaClient();

// L'hôte est celui de l'import de territoire ; les champs sont ceux de la fiche complète.
const GEO_URL =
  `${TERRITORY.GEO_API_URL}/communes?fields=nom,code,siren,codesPostaux,population,codeDepartement,epci,mairie,centre`;
const ANNUAIRE_URL =
  'https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/exports/json' +
  '?where=' +
  encodeURIComponent('pivot like "mairie"') +
  '&select=' +
  encodeURIComponent(
    'nom,siren,siret,code_insee_commune,pivot,telephone,adresse_courriel,site_internet,plage_ouverture,commentaire_plage_ouverture,adresse',
  );

/** Le type de structure est celui de l'import de territoire ; le préfixe vient du référentiel. */
const STRUCTURE_TYPE = TERRITORY.STRUCTURE_TYPE;
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

interface AnnuaireRow {
  nom?: string;
  siret?: string;
  code_insee_commune?: string | string[];
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
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found?.split('=').slice(1).join('=');
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

/** L'Annuaire encode du JSON dans des chaînes : téléphone, site, adresse, horaires. */
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

/** Une commune nouvelle porte plusieurs mairies : on garde la principale, pas une annexe. */
function pickTownHall(candidates: AnnuaireRow[], communeName: string): AnnuaireRow {
  if (candidates.length === 1) return candidates[0];
  const normalize = (s: string): string =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
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

/** Même composition que buildSireneAddress : compléments puis voie. */
function address(row: AnnuaireRow | undefined): string | null {
  const first = row ? parseJson<Record<string, string>>(row.adresse)[0] : undefined;
  if (!first) return null;
  const parts = [first.complement1, first.complement2, first.numero_voie].map((s) => s?.trim()).filter(Boolean);
  return parts.join(', ').slice(0, 255) || null;
}

const cut = (value: string | null | undefined, max: number): string | null =>
  value ? value.slice(0, max) : null;

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

// ---------------------------------------------------------------------------- programme

async function main(): Promise<void> {
  const slug = arg('project') ?? 'periscolia';
  const dryRun = flag('dry-run');
  const reset = flag('reset');
  const departments = arg('departments')?.split(',').map((d) => d.trim()).filter(Boolean);

  const project = await prisma.project.findFirst({ where: { slug }, select: { id: true, name: true } });
  if (!project) throw new Error(`Projet "${slug}" introuvable`);

  const reference = await prisma.referenceItem.findFirst({
    where: { projectId: project.id, category: 'STRUCTURE_TYPE', key: STRUCTURE_TYPE, active: true },
    select: { metadata: true },
  });
  if (!reference) throw new Error(`Le référentiel STRUCTURE_TYPE du projet ne connaît pas "${STRUCTURE_TYPE}"`);
  const prefixValue = (reference.metadata as { prefix?: unknown } | null)?.prefix;
  const displayPrefix = typeof prefixValue === 'string' && prefixValue.trim() ? prefixValue : null;

  const author = await prisma.userRoleProject.findFirst({
    where: { projectId: project.id },
    select: { userId: true },
  });
  if (!author) throw new Error('Aucun membre sur le projet : le lot d\'import a besoin d\'un auteur');

  console.log(`\nProjet ${project.name} (${slug})${dryRun ? ' — SIMULATION' : ''}`);

  // ---------------------------------------------------------------- 1. les deux sources
  console.log('\n1. Téléchargement');
  const [geo, annuaire] = await Promise.all([
    fetchJson<GeoCommune[]>(GEO_URL, 'geo.api.gouv.fr'),
    fetchJson<AnnuaireRow[]>(ANNUAIRE_URL, 'Annuaire de l\'administration'),
  ]);

  // ---------------------------------------------------------------- 2. jointure
  console.log('\n2. Jointure sur le code INSEE');
  const townHalls = new Map<string, AnnuaireRow[]>();
  for (const row of annuaire) {
    const raw = row.code_insee_commune;
    for (const code of Array.isArray(raw) ? raw : raw ? [raw] : []) {
      const list = townHalls.get(code);
      if (list) list.push(row);
      else townHalls.set(code, [row]);
    }
  }

  const selected = departments?.length
    ? geo.filter((c) => departments.includes(c.codeDepartement))
    : geo;

  const rows: Prisma.OrganizationCreateManyInput[] = selected.map((commune) => {
    const candidates = townHalls.get(commune.code);
    const hall = candidates?.length ? pickTownHall(candidates, commune.nom) : undefined;
    const [longitude, latitude] = commune.mairie?.coordinates ?? commune.centre?.coordinates ?? [];
    const email = (hall?.adresse_courriel ?? '').split(';')[0].trim() || null;
    const row: Prisma.OrganizationCreateManyInput = {
      projectId: project.id,
      name: cut(commune.nom, 200)!,
      type: STRUCTURE_TYPE,
      displayPrefix,
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
      email: cut(email, 255),
      website: cut(firstValue(hall, 'site_internet'), 255),
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      salesStatus: SalesStatus.NOT_CONTACTED,
      completenessScore: 0,
    };
    const hours = openingHours(hall);
    if (hours) row.openingHours = hours;
    row.completenessScore = completeness(row);
    return row;
  });

  // Une même mairie sert parfois plusieurs codes INSEE (communes nouvelles) : son SIRET
  // arriverait alors sur plusieurs fiches, ce que l'unicité (project_id, siret) refuse.
  // On le garde sur la commune dont le nom correspond à la mairie, on l'efface ailleurs —
  // les autres colonnes de la mairie (téléphone, horaires…) restent, elles ne sont pas uniques.
  const bySiret = new Map<string, Prisma.OrganizationCreateManyInput[]>();
  for (const row of rows) {
    if (!row.siret) continue;
    const list = bySiret.get(row.siret);
    if (list) list.push(row);
    else bySiret.set(row.siret, [row]);
  }
  let siretCleared = 0;
  for (const [, sharing] of bySiret) {
    if (sharing.length < 2) continue;
    const keeper = sharing.find((r) => r.inseeCode && r.siret?.startsWith(`21${r.inseeCode.slice(0, 3)}`)) ?? sharing[0];
    for (const row of sharing) {
      if (row === keeper) continue;
      row.siret = null;
      row.completenessScore = completeness(row);
      siretCleared += 1;
    }
  }
  if (siretCleared) console.log(`  SIRET partagés par plusieurs communes, effacés : ${siretCleared}`);

  const withHall = rows.filter((r) => r.phone || r.email).length;
  console.log(`  ${rows.length} communes retenues${departments ? ` (départements ${departments.join(', ')})` : ''}`);
  console.log(`  mairie rattachée : ${withHall} (${((100 * withHall) / rows.length).toFixed(1)} %)`);

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
  const known = new Set(
    (
      await prisma.organization.findMany({
        where: { projectId: project.id, inseeCode: { not: null } },
        select: { inseeCode: true },
      })
    ).map((o) => o.inseeCode as string),
  );
  const todo = rows.filter((r) => !known.has(r.inseeCode as string));
  console.log(`\n${reset ? '4' : '3'}. Insertion — ${todo.length} à créer, ${rows.length - todo.length} déjà présentes`);

  if (dryRun) {
    console.log('  SIMULATION : rien n\'a été écrit');
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
  console.log(`\r  ${created} communes créées en ${((Date.now() - started) / 1000).toFixed(1)} s — lot ${batch.id}`);
}

main()
  .catch((error) => {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
