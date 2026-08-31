import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { apiError } from '@/common/api-error';

/** E-mail addresses are stored lower-cased and trimmed (unique index on users.email). */
export function normalizeEmail(raw: string): string {
  return raw.toLowerCase().trim();
}

/** 409 EMAIL_ALREADY_TAKEN when another user already holds the address. */
export async function assertEmailAvailable(
  db: Pick<PrismaService, 'user'> | Prisma.TransactionClient,
  email: string,
  excludeUserId?: string,
): Promise<void> {
  const conflict = await db.user.findFirst({
    where: { email, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    select: { id: true },
  });
  if (conflict) throw apiError.conflict('EMAIL_ALREADY_TAKEN');
}
