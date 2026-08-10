import { PrismaClient } from '@prisma/client';
import { runSeed } from './runSeed';

const prisma = new PrismaClient();

async function main() {
  await runSeed(prisma);
}
main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
