// tsx does not load .env: needed for DATABASE_URL, MINIO_*, SEED_PASSWORD, BCRYPT_ROUNDS
import 'dotenv/config';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { runSeed } from './runSeed';

// The seed's own variables (ADMIN_*) live in a dedicated file. Absent in the container: the compose
// injects it there (env_file), and dotenv never overrides a variable already set.
config({ path: '.env.seed' });

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
