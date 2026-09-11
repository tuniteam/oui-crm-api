/**
 * System role codes (SPEC-06 §4.1) — a Prisma enum, declared in schema.prisma like the others.
 * Re-exported here so existing imports keep working; the production seed imports it from
 * @prisma/client directly, the image having no src/.
 */
export { UserRole } from '@prisma/client';
