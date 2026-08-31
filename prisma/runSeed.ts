import { PrismaClient } from '@prisma/client';
import { DEFAULT_NODE_ENV, NodeEnv } from '../src/common/constants/app.constants';
import { seedAuth } from './seedAuth';
import { seedDev } from './seedDev';

/**
 * seedAuth runs on every environment (permissions, system roles, matrix).
 * seedDev (Périscolia project, demo users, configuration) runs in development and test only.
 */
export async function runSeed(prisma: PrismaClient): Promise<void> {
  const env = (process.env.NODE_ENV as NodeEnv) ?? DEFAULT_NODE_ENV;
  console.log(`Seed started for environment: ${env}`);

  await seedAuth(prisma);

  if (env === NodeEnv.DEVELOPMENT || env === NodeEnv.TEST) {
    await seedDev(prisma);
  }

  console.log('Seed finished');
}
