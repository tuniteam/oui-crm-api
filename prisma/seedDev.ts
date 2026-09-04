// ============================================
// OUI-CRM - Development seed: platform super admin, Périscolia project, its configuration,
// demo users and the stamp/signature image. Idempotent (upserts). Development/test only.
// ============================================

import * as fs from 'fs';
import * as path from 'path';
import * as Minio from 'minio';
import {
  DocumentTemplateType,
  FileCategory,
  FileOwnerType,
  PrismaClient,
  ProjectStatus,
  RelationshipStatus,
  UserStatus,
} from '@prisma/client';
import { UserRole } from '../src/auth/enums/user-role.enum';
import { hashPassword, resolveBcryptRounds } from '../src/auth/utils/password.utils';
import { MIME } from '../src/common/constants/mime.constants';
import { LEGAL_DOCUMENTS, LegalDocument } from '../src/common/legal/legal.constants';
import { buildFileCreateData } from '../src/files/files.utils';
import { bootstrapProject } from '../src/projects/project-bootstrap';
import { INITIAL_PRICING_GRID_VERSION } from '../src/projects/project-config.constants';
import { buildObjectPath } from '../src/storage/storage.utils';
import { PERISCOLIA_PRICING_GRID_V1 } from '../src/pricing/periscolia-grid.constants';
import {
  PERISCOLIA_CONFIG,
  PERISCOLIA_PROJECT,
  PERISCOLIA_QUOTE_TEMPLATE_PATH,
  PERISCOLIA_SIGNATURE_IMAGE_PATH,
  PERISCOLIA_USERS,
  PLATFORM_SUPER_ADMIN,
} from './seed-data/periscolia.config';

const EXTERNAL_ACCOUNT_DAYS = 365;

export async function seedDev(prisma: PrismaClient): Promise<void> {
  console.log('Seeding development data (Périscolia)...');

  const seedPassword = process.env.SEED_PASSWORD;
  if (!seedPassword) throw new Error('SEED_PASSWORD is not configured (.env)');
  const passwordHash = await hashPassword(seedPassword, resolveBcryptRounds(process.env.BCRYPT_ROUNDS));

  const roles = await prisma.role.findMany({ where: { projectId: null } });
  const roleByCode = new Map(roles.map((r) => [r.code, r.id]));
  const roleId = (code: UserRole): string => {
    const id = roleByCode.get(code);
    if (!id) throw new Error(`System role ${code} missing — run seedAuth first`);
    return id;
  };

  // ---------- Platform super admin (backoffice relation, no project) ----------
  await renameDemoAccount(prisma, null, PLATFORM_SUPER_ADMIN.initials, PLATFORM_SUPER_ADMIN.email);
  const superAdmin = await prisma.user.upsert({
    where: { email: PLATFORM_SUPER_ADMIN.email },
    // Demo accounts follow SEED_PASSWORD deterministically: re-seeding resets their password
    update: { password: passwordHash },
    create: {
      email: PLATFORM_SUPER_ADMIN.email,
      password: passwordHash,
      firstName: PLATFORM_SUPER_ADMIN.firstName,
      lastName: PLATFORM_SUPER_ADMIN.lastName,
      status: UserStatus.ACTIVE,
    },
  });
  const backofficeRelation = await prisma.userRoleProject.findFirst({
    where: { userId: superAdmin.id, projectId: null },
  });
  if (!backofficeRelation) {
    await prisma.userRoleProject.create({
      data: {
        userId: superAdmin.id,
        projectId: null,
        roleId: roleId(UserRole.SUPER_ADMIN),
        initials: PLATFORM_SUPER_ADMIN.initials,
        status: RelationshipStatus.ACTIVE,
        displayOrder: 1,
      },
    });
  }

  // ---------- Périscolia project + configuration ----------
  const project = await prisma.project.upsert({
    where: { slug: PERISCOLIA_PROJECT.slug },
    update: {},
    create: { ...PERISCOLIA_PROJECT, status: ProjectStatus.ACTIVE, activatedAt: new Date() },
  });

  await prisma.$transaction(async (tx) => {
    await bootstrapProject(tx, project.id, PERISCOLIA_CONFIG);
    // Replace the empty v1 grid with the V8 grid (only while v1 is the sole version)
    await tx.pricingGrid.updateMany({
      where: { projectId: project.id, version: INITIAL_PRICING_GRID_VERSION },
      data: { content: PERISCOLIA_PRICING_GRID_V1, active: true },
    });
  });

  // ---------- Demo users and assignments ----------
  const scopes = await prisma.scope.findMany({ where: { projectId: project.id } });
  const scopeByName = new Map(scopes.map((s) => [s.name, s.id]));
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + EXTERNAL_ACCOUNT_DAYS);

  await Promise.all(
    PERISCOLIA_USERS.map(async (u) => {
      await renameDemoAccount(prisma, project.id, u.initials, u.email);
      const user = await prisma.user.upsert({
        where: { email: u.email },
        update: { password: passwordHash },
        create: {
          email: u.email,
          password: passwordHash,
          firstName: u.firstName,
          lastName: u.lastName,
          status: UserStatus.ACTIVE,
          cguVersion: LEGAL_DOCUMENTS[LegalDocument.CGU].version,
          cguAcceptedAt: new Date(),
          rgpdVersion: LEGAL_DOCUMENTS[LegalDocument.RGPD].version,
          rgpdAcceptedAt: new Date(),
        },
      });
      await prisma.userRoleProject.upsert({
        where: { userId_projectId: { userId: user.id, projectId: project.id } },
        update: { roleId: roleId(u.role), scopeId: scopeByName.get(u.scope) ?? null },
        create: {
          userId: user.id,
          projectId: project.id,
          roleId: roleId(u.role),
          scopeId: scopeByName.get(u.scope) ?? null,
          initials: u.initials,
          status: RelationshipStatus.ACTIVE,
          displayOrder: 1,
          expiresAt: u.external ? expiresAt : null,
        },
      });
    }),
  );

  // ---------- Signature image (best effort: needs MinIO up and the PNG in docs/) ----------
  await seedSignatureImage(prisma, project.id, superAdmin.id);
  await seedQuoteTemplate(prisma, project.id, superAdmin.id);

  console.log(`Périscolia project ready (${PERISCOLIA_USERS.length} users + super admin)`);
}

/**
 * A demo account is identified by its initials within a project (unique per project). When the
 * seed data changes an e-mail, the existing user is renamed instead of creating a duplicate
 * that would collide on the initials.
 */
async function renameDemoAccount(
  prisma: PrismaClient,
  projectId: string | null,
  initials: string,
  email: string,
): Promise<void> {
  const relation = await prisma.userRoleProject.findFirst({
    where: { projectId, initials },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!relation || relation.user.email === email) return;
  const holder = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (holder && holder.id !== relation.user.id) {
    console.warn(`Demo account ${initials}: target e-mail ${email} already belongs to another user — rename skipped`);
    return;
  }
  await prisma.user.update({ where: { id: relation.user.id }, data: { email } });
  console.log(`Demo account ${initials}: ${relation.user.email} -> ${email}`);
}

export async function seedSignatureImage(prisma: PrismaClient, projectId: string, uploadedBy: string) {
  const existing = await prisma.file.findFirst({
    where: { projectId, ownerType: FileOwnerType.PROJECT, category: FileCategory.SIGNATURE_IMAGE },
  });
  if (existing) return;
  if (!fs.existsSync(PERISCOLIA_SIGNATURE_IMAGE_PATH)) {
    console.warn(`Signature image not found (${PERISCOLIA_SIGNATURE_IMAGE_PATH}) — skipped`);
    return;
  }
  const endPoint = process.env.MINIO_ENDPOINT;
  const port = process.env.MINIO_PORT;
  const bucket = process.env.MINIO_BUCKET;
  if (!endPoint || !port || !bucket) {
    console.warn('MINIO_ENDPOINT / MINIO_PORT / MINIO_BUCKET not set — signature image skipped');
    return;
  }
  try {
    // Same client settings as src/storage/storage.module.ts, from process.env (no Nest context here)
    const client = new Minio.Client({
      endPoint,
      port: Number(port),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY ?? '',
      secretKey: process.env.MINIO_SECRET_KEY ?? '',
    });
    if (!(await client.bucketExists(bucket))) {
      await client.makeBucket(bucket);
      console.log(`MinIO bucket "${bucket}" created`);
    }
    const buffer = fs.readFileSync(PERISCOLIA_SIGNATURE_IMAGE_PATH);
    const fileName = path.basename(PERISCOLIA_SIGNATURE_IMAGE_PATH);
    const objectKey = buildObjectPath(
      {
        type: 'ENTITY_FILE',
        projectId,
        ownerType: FileOwnerType.PROJECT,
        ownerId: projectId,
        category: FileCategory.SIGNATURE_IMAGE,
      },
      path.extname(fileName),
    );
    await client.putObject(bucket, objectKey, buffer, buffer.byteLength, { 'Content-Type': MIME.PNG });
    await prisma.file.create({
      data: buildFileCreateData({
        projectId,
        ownerType: FileOwnerType.PROJECT,
        ownerId: projectId,
        category: FileCategory.SIGNATURE_IMAGE,
        fileName,
        filePath: objectKey,
        fileSize: buffer.byteLength,
        mimeType: MIME.PNG,
        uploadedBy,
      }),
    });
    console.log('Signature image uploaded to MinIO');
  } catch (e) {
    console.warn(`Signature image upload skipped: ${(e as Error).message}`);
  }
}

/**
 * Gabarit « Devis » du projet : le CRM ne doit pas partir d'une page blanche. Même chemin que le
 * cachet — un `File` `HTML_TEMPLATE` de type `QUOTE`, que l'administrateur remplacera en
 * téléversant le sien (US-00-08, phase H).
 */
export async function seedQuoteTemplate(prisma: PrismaClient, projectId: string, uploadedBy: string) {
  const existing = await prisma.file.findFirst({
    where: {
      projectId,
      ownerType: FileOwnerType.PROJECT,
      category: FileCategory.HTML_TEMPLATE,
      templateType: DocumentTemplateType.QUOTE,
    },
  });
  if (existing) return;
  if (!fs.existsSync(PERISCOLIA_QUOTE_TEMPLATE_PATH)) {
    console.warn(`Quote template not found (${PERISCOLIA_QUOTE_TEMPLATE_PATH}) — skipped`);
    return;
  }
  const endPoint = process.env.MINIO_ENDPOINT;
  const port = process.env.MINIO_PORT;
  const bucket = process.env.MINIO_BUCKET;
  if (!endPoint || !port || !bucket) {
    console.warn('MINIO_ENDPOINT / MINIO_PORT / MINIO_BUCKET not set — quote template skipped');
    return;
  }
  try {
    const client = new Minio.Client({
      endPoint,
      port: Number(port),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY ?? '',
      secretKey: process.env.MINIO_SECRET_KEY ?? '',
    });
    if (!(await client.bucketExists(bucket))) await client.makeBucket(bucket);
    const buffer = fs.readFileSync(PERISCOLIA_QUOTE_TEMPLATE_PATH);
    const fileName = path.basename(PERISCOLIA_QUOTE_TEMPLATE_PATH);
    const objectKey = buildObjectPath(
      {
        type: 'ENTITY_FILE',
        projectId,
        ownerType: FileOwnerType.PROJECT,
        ownerId: projectId,
        category: FileCategory.HTML_TEMPLATE,
      },
      path.extname(fileName),
    );
    await client.putObject(bucket, objectKey, buffer, buffer.byteLength, { 'Content-Type': MIME.HTML });
    await prisma.file.create({
      data: {
        ...buildFileCreateData({
          projectId,
          ownerType: FileOwnerType.PROJECT,
          ownerId: projectId,
          category: FileCategory.HTML_TEMPLATE,
          fileName,
          filePath: objectKey,
          fileSize: buffer.byteLength,
          mimeType: MIME.HTML,
          uploadedBy,
        }),
        templateType: DocumentTemplateType.QUOTE,
      },
    });
    console.log('Quote template uploaded to MinIO');
  } catch (e) {
    console.warn(`Quote template upload skipped: ${(e as Error).message}`);
  }
}
