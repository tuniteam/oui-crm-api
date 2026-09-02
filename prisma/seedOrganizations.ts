// ============================================
// OUI-CRM - Seed du jeu de démonstration L1 (organismes + contacts)
// Idempotent : rapprochement sur (projectId, name). Réutilisé par seedDev et par
// `db:restore --with-data`.
// ============================================

import { Prisma } from '@prisma/client';
import { completenessScore } from '../src/organizations/organizations.utils';
import { PERISCOLIA_DEMO_ORGANIZATIONS } from './seed-data/periscolia.organizations';

type Db = Prisma.TransactionClient;

/** Crée les organismes de démonstration absents du projet, avec leurs contacts. */
export async function seedDemoOrganizations(db: Db, projectId: string): Promise<number> {
  const relations = await db.userRoleProject.findMany({
    where: { projectId },
    select: { initials: true, userId: true },
  });
  const userByInitials = new Map(relations.map((r) => [r.initials, r.userId]));

  const existing = await db.organization.findMany({ where: { projectId }, select: { name: true } });
  const existingNames = new Set(existing.map((o) => o.name));

  let created = 0;
  for (const demo of PERISCOLIA_DEMO_ORGANIZATIONS) {
    if (existingNames.has(demo.name)) continue;
    const { contacts = [], salesRepInitials, ...data } = demo;

    const organization = await db.organization.create({
      data: {
        ...data,
        projectId,
        salesRepId: salesRepInitials ? (userByInitials.get(salesRepInitials) ?? null) : null,
      },
    });

    if (contacts.length) {
      await db.contact.createMany({
        data: contacts.map((c) => ({ ...c, projectId, organizationId: organization.id })),
      });
    }

    // Même règle que l'API : le contact principal compte dans le score.
    await db.organization.update({
      where: { id: organization.id },
      data: {
        completenessScore: completenessScore({
          siret: organization.siret,
          address: organization.address,
          postalCode: organization.postalCode,
          population: organization.population,
          email: organization.email,
          hasPrimaryContact: contacts.some((c) => c.isPrimary),
        }),
      },
    });
    created += 1;
  }
  return created;
}
