import { PrismaClient } from '@prisma/client';

export async function runSeed(prisma: PrismaClient) {
  console.log('Running seed...');
  const env = process.env.NODE_ENV;

  console.log(`Seed started for environment: ${env}`);

  if (env === 'test') {
    console.log('Running test seed...');
   // await seedAuth(prisma);
  //  await seedUsers(prisma);
  } else {
   // await seedAuth(prisma);
  }

  console.log('seed finished');
}
