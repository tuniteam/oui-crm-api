import { Prisma } from '@prisma/client';
import { ReferenceCategory } from '@/projects/project-config.constants';

/** Audit actions written by the reference-items module (SPEC-02 §4.3). */
export const REFERENCE_ITEMS_AUDIT = {
  CREATE: 'referenceItem.create',
  UPDATE: 'referenceItem.update',
} as const;

/** Immutable technical key of a value (matches the seed keys: UPPER_SNAKE). */
export const REFERENCE_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
export const REFERENCE_KEY_MAX_LENGTH = 60;
export const REFERENCE_LABEL_MAX_LENGTH = 150;

/** Rows of one category → key → number of business objects using the value. */
export type UsageCounter = (db: Prisma.TransactionClient, projectId: string) => Promise<Map<string, number>>;

/**
 * Registry of usage counters by category. Empty at L0 (every usageCount is 0); each later lot
 * registers its counter from its own module (organizations for STRUCTURE_TYPE / TAG /
 * LEAD_SOURCE / SERVICE / VENDOR / SOLUTION, activities for ACTIVITY_*, tickets…) — this
 * module must never import business modules.
 */
export const REFERENCE_USAGE_COUNTERS: Partial<Record<ReferenceCategory, UsageCounter>> = {};

export function registerUsageCounter(category: ReferenceCategory, counter: UsageCounter): void {
  REFERENCE_USAGE_COUNTERS[category] = counter;
}
