// ============================================
// OUI-CRM - E2E project reset (decision of 03/09/2026): the BDD suites run on their own
// dataset, `periscolia-e2e`, so the demo project stays the front team's playground and a
// manual deletion there can never break the regression again.
//
// Self-sufficient on purpose (no dependency on restoreProject.ts): each run DROPS the e2e
// project and recreates it from the seed — same configuration as the demo (bootstrap +
// Périscolia config + V8 grid), same demo accounts attached with the same roles, scopes and
// initials, same 10 demo organizations, same signature image. Determinism by reconstruction,
// not by realignment.
//   npx tsx prisma/seedE2eProject.ts        (run-all.sh does it before every regression)
// ============================================

import { PrismaClient, ProjectStatus, RelationshipStatus } from '@prisma/client';
import { UserRole } from '../src/auth/enums/user-role.enum';
import { bootstrapProject } from '../src/projects/project-bootstrap';
import { INITIAL_PRICING_GRID_VERSION } from '../src/projects/project-config.constants';
import { PERISCOLIA_PRICING_GRID_V1 } from './seed-data/periscolia.pricing-grid';
import {
  PERISCOLIA_CONFIG,
  PERISCOLIA_PROJECT,
  PERISCOLIA_USERS,
  PLATFORM_SUPER_ADMIN,
} from './seed-data/periscolia.config';
import { seedDemoOrganizations } from './seedOrganizations';
import { seedSignatureImage } from './seedDev';

const EXTERNAL_ACCOUNT_DAYS = 365;

export const E2E_PROJECT = {
  slug: 'periscolia-e2e',
  name: 'Périscolia E2E',
  productName: PERISCOLIA_PROJECT.productName,
  description: 'Jeu de données des suites BDD — la démo vit sur periscolia',
} as const;

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    // Reconstruction from scratch: cascades take settings, referentials, scopes, records,
    // batches and assignments away with the project.
    await prisma.project.deleteMany({ where: { slug: E2E_PROJECT.slug } });

    const project = await prisma.project.create({
      data: { ...E2E_PROJECT, status: ProjectStatus.ACTIVE, activatedAt: new Date() },
      select: { id: true },
    });
    await prisma.$transaction(async (tx) => {
      await bootstrapProject(tx, project.id, PERISCOLIA_CONFIG);
      // Same V8 grid as the demo project (bracketLabel tests depend on its brackets)
      await tx.pricingGrid.updateMany({
        where: { projectId: project.id, version: INITIAL_PRICING_GRID_VERSION },
        data: { content: PERISCOLIA_PRICING_GRID_V1, active: true },
      });
    });

    // The demo ACCOUNTS are global (seedDev creates them): attach them to the e2e project
    // with the same role, scope and initials — the suites keep their logins unchanged.
    const [scopes, roles] = await Promise.all([
      prisma.scope.findMany({ where: { projectId: project.id }, select: { id: true, name: true } }),
      prisma.role.findMany({ where: { projectId: null }, select: { id: true, code: true } }),
    ]);
    const scopeByName = new Map(scopes.map((s) => [s.name, s.id]));
    const roleByCode = new Map(roles.map((r) => [r.code, r.id]));
    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + EXTERNAL_ACCOUNT_DAYS);

    for (const u of PERISCOLIA_USERS) {
      const user = await prisma.user.findUnique({ where: { email: u.email }, select: { id: true } });
      if (!user) throw new Error(`Demo account ${u.email} missing — run npm run db:seed first`);
      const roleId = roleByCode.get(u.role as UserRole);
      if (!roleId) throw new Error(`System role ${u.role} missing — run npm run db:seed first`);
      // displayOrder is unique per user: always the next free slot
      const max = await prisma.userRoleProject.aggregate({
        where: { userId: user.id },
        _max: { displayOrder: true },
      });
      await prisma.userRoleProject.create({
        data: {
          userId: user.id,
          projectId: project.id,
          roleId,
          scopeId: scopeByName.get(u.scope) ?? null,
          initials: u.initials,
          status: RelationshipStatus.ACTIVE,
          displayOrder: (max._max.displayOrder ?? 0) + 1,
          expiresAt: u.external ? expiresAt : null,
        },
      });
    }

    // Settings of the seed (bootstrap installs the generic defaults; the demo values —
    // company identity, targets, 25/60/80 stages — are the Périscolia config's)
    const { stageProbabilities, company, ...scalars } = PERISCOLIA_CONFIG.settings ?? {};
    if (Object.keys({ ...scalars }).length || stageProbabilities || company) {
      await prisma.settings.update({
        where: { projectId: project.id },
        data: { ...scalars, ...(stageProbabilities ? { stageProbabilities } : {}), ...(company ? { company } : {}) },
      });
    }

    const seeded = await seedDemoOrganizations(prisma, project.id);

    const superAdmin = await prisma.user.findUnique({
      where: { email: PLATFORM_SUPER_ADMIN.email },
      select: { id: true },
    });
    if (superAdmin) await seedSignatureImage(prisma, project.id, superAdmin.id);

    console.log(
      `✓ ${E2E_PROJECT.name} (${E2E_PROJECT.slug}) rebuilt — ${PERISCOLIA_USERS.length} accounts, ${seeded} demo organizations`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: Error) => {
  console.error(`✗ ${e.message}`);
  process.exitCode = 1;
});
