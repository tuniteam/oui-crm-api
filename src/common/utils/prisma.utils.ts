import { Prisma } from '@prisma/client';
import { PRISMA_ERROR } from '@/common/constants/app.constants';

/** True for a P2002; with `column`, only when that column is part of the violated index. */
export function isUniqueViolation(err: unknown, column?: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== PRISMA_ERROR.UNIQUE_VIOLATION) return false;
  if (!column) return true;
  const target = err.meta?.target;
  return Array.isArray(target) ? target.includes(column) : String(target ?? '').includes(column);
}

export function isForeignKeyViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === PRISMA_ERROR.FOREIGN_KEY_VIOLATION;
}
