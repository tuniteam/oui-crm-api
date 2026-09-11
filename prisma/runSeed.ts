import { PrismaClient } from '@prisma/client';
import { DEFAULT_NODE_ENV, NodeEnv } from '../src/common/constants/app.constants';
import { normalizeEmail } from '../src/common/utils/email.utils';
import { assertPasswordStrength, hashPassword, resolveBcryptRounds } from '../src/auth/utils/password.utils';
import { BACKOFFICE_INITIALS } from '../src/users-backoffice/users-backoffice.constants';
import { ensurePlatformSuperAdmin } from './seedAdmin';
import { seedAuth } from './seedAuth';
import { seedDev } from './seedDev';

/**
 * seedAuth runs on every environment (permissions, system roles, matrix): the catalogue follows
 * the code, so each deployment re-syncs it. It is idempotent — the container runs it at every
 * start (SPEC-20).
 * The first platform administrator is created when ADMIN_EMAIL is set, on any environment.
 * seedDev (Périscolia project, demo users, configuration) runs in development and test only.
 */
export async function runSeed(prisma: PrismaClient): Promise<void> {
  const env = (process.env.NODE_ENV as NodeEnv) ?? DEFAULT_NODE_ENV;
  console.log(`Seed started for environment: ${env}`);

  await seedAuth(prisma);
  await seedFirstAdmin(prisma);

  if (env === NodeEnv.DEVELOPMENT || env === NodeEnv.TEST) {
    await seedDev(prisma);
  }

  console.log('Seed finished');
}

/**
 * A production database carries no account: the dump excludes them on purpose. Without this, no
 * one could log in. Create-only — an existing account is never touched, so leaving the variables
 * in place after the first deployment changes nothing.
 */
async function seedFirstAdmin(prisma: PrismaClient): Promise<void> {
  const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password, ADMIN_FIRST_NAME: firstName, ADMIN_LAST_NAME: lastName } =
    process.env;
  if (!email) return;
  if (!password || !firstName || !lastName) {
    throw new Error('ADMIN_EMAIL requires ADMIN_PASSWORD, ADMIN_FIRST_NAME and ADMIN_LAST_NAME');
  }
  assertPasswordStrength(password);

  const passwordHash = await hashPassword(password, resolveBcryptRounds(process.env.BCRYPT_ROUNDS));
  await ensurePlatformSuperAdmin(
    prisma,
    { email: normalizeEmail(email), firstName, lastName, initials: BACKOFFICE_INITIALS, passwordHash },
    { resetPassword: false },
  );
  console.log(`First administrator ensured: ${email}`);
}
