import { PrismaClient } from '@prisma/client';
import { seedAuth } from './seedAuth';

/**
 * The only environment that receives the demo data, and the one assumed when NODE_ENV is unset —
 * NodeEnv.DEVELOPMENT, which the seed cannot import: the production image has no src/.
 */
const DEMO_DATA_ENV = 'development';

/**
 * seedAuth runs on every environment (permissions, system roles, matrix).
 * seedDev (Périscolia project, demo users, configuration) runs in development only.
 *
 * Nothing here imports from src/: the production image has no src/ (the soft-m-api rule).
 * seedDev does import from src/, so it is loaded only where it runs — a static import would
 * make the container fail at start with "Cannot find module '../src/…'".
 */
export async function runSeed(prisma: PrismaClient): Promise<void> {
  const env = process.env.NODE_ENV ?? DEMO_DATA_ENV;
  console.log(`Seed started for environment: ${env}`);

  await seedAuth(prisma);

  if (env === DEMO_DATA_ENV) {
    const { seedDev } = await import('./seedDev');
    await seedDev(prisma);
  }

  console.log('Seed finished');
}
