// tsx does not load .env: needed for DATABASE_URL, MINIO_*, SEED_PASSWORD, BCRYPT_ROUNDS
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { runSeed } from './runSeed';

const prisma = new PrismaClient();

async function main() {
  await runSeed(prisma);
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => await prisma.$disconnect());
