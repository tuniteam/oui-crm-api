// ============================================
// OUI-CRM - Project restore (SPEC-13 décision D3)
// Remet un projet à sa configuration de seed : réglages, référentiels, features, périmètres.
// `bootstrapProject` **crée** ce qui manque (upsert avec `update: {}`) ; il ne **répare** rien.
// Ce script écrase, et c'est le seul endroit du dépôt qui le fait.
//
// Ne touche ni aux comptes utilisateurs, ni aux autres projets, ni aux données commerciales
// (organismes, contacts, actions) : voir --with-data pour ces dernières.
//
//   npm run db:restore -- --project=periscolia
//   npm run db:restore -- --project=periscolia --with-data
// ============================================

import { PrismaClient, RelationshipStatus } from '@prisma/client';
import { mergeProjectConfig, upsertProjectFeatures } from '../src/projects/project-bootstrap';
import { PERISCOLIA_CONFIG, PERISCOLIA_PROJECT, PERISCOLIA_USERS } from './seed-data/periscolia.config';
import { seedDemoOrganizations } from './seedOrganizations';

const prisma = new PrismaClient();

/** Per-project seed configuration, by slug. A project absent here restores generic defaults. */
const CONFIG_BY_SLUG: Record<string, Parameters<typeof mergeProjectConfig>[0]> = {
  [PERISCOLIA_PROJECT.slug]: PERISCOLIA_CONFIG,
};

function parseArgs(): { slug: string; withData: boolean } {
  const args = process.argv.slice(2);
  const slug = args.find((a) => a.startsWith('--project='))?.split('=')[1];
  if (!slug) {
    throw new Error('Usage: npm run db:restore -- --project=<slug> [--with-data]');
  }
  return { slug, withData: args.includes('--with-data') };
}

async function restore(slug: string, withData: boolean): Promise<void> {
  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!project) throw new Error(`Project "${slug}" not found`);

  const config = mergeProjectConfig(CONFIG_BY_SLUG[slug] ?? {});
  const projectId = project.id;

  await prisma.$transaction(async (tx) => {
    // --- Settings: overwrite, unlike bootstrapProject which keeps the existing row.
    const { stageProbabilities, company, ...scalars } = config.settings;
    await tx.settings.upsert({
      where: { projectId },
      create: { projectId, ...scalars, stageProbabilities, company },
      update: { ...scalars, stageProbabilities, company },
    });

    // --- Reference items: label, order and metadata realigned on the seed.
    // Values added by hand on the project are left untouched: restoring is not purging.
    let realigned = 0;
    const categories = Object.entries(config.referenceItems);
    for (const [category, items] of categories) {
      await Promise.all(
        (items ?? []).map((item, index) =>
          tx.referenceItem
            .update({
              where: { projectId_category_key: { projectId, category, key: item.key } },
              data: { label: item.label, order: index, active: true, metadata: item.metadata ?? {} },
            })
            .then(() => {
              realigned += 1;
            })
            .catch(() => undefined), // absent from the project: created by the seed, not here
        ),
      );
    }

    await upsertProjectFeatures(tx, projectId, config.features);

    // --- Project assignments of the seed users: reactivated and re-scoped.
    // A suspended assignment empties the caller project list, which silently breaks unrelated
    // features (a SUSPENDED admin could no longer read the project files — observed 02/09).
    // Accounts themselves are never touched: only their link to this project.
    const scopes = await tx.scope.findMany({ where: { projectId }, select: { id: true, name: true } });
    const scopeByName = new Map(scopes.map((s) => [s.name, s.id]));
    let reactivated = 0;
    for (const seedUser of PERISCOLIA_USERS) {
      const user = await tx.user.findUnique({ where: { email: seedUser.email }, select: { id: true } });
      if (!user) continue;
      const done = await tx.userRoleProject.updateMany({
        where: { userId: user.id, projectId },
        data: { status: RelationshipStatus.ACTIVE, scopeId: scopeByName.get(seedUser.scope) ?? null },
      });
      reactivated += done.count;
    }

    if (withData) {
      // Commercial data of the project only. Cascades handle contacts, activities and
      // campaign links; campaigns and import batches are removed explicitly.
      await tx.organization.deleteMany({ where: { projectId } });
      await tx.campaign.deleteMany({ where: { projectId } });
      await tx.importBatch.deleteMany({ where: { projectId } });
      const seeded = await seedDemoOrganizations(tx, projectId);
      console.log('  commercial data reset — ' + seeded + ' demo organizations recreated');
    }

    console.log(`✓ ${project.name} (${slug}) restored — settings, ${realigned} reference items, features, ${reactivated} assignments`);
  });
}

const { slug, withData } = parseArgs();

restore(slug, withData)
  .catch((e: Error) => {
    console.error(`✗ ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
