// ============================================
// OUI-CRM - Project bootstrap (SPEC-10 §3.1, SPEC-08 R6)
// Pure functions on a Prisma transaction client: used by ProjectBootstrapService
// (POST /projects) and by the development seed. No Nest dependency injection here.
// ============================================

import { FeatureCode, Prisma, ProjectFeature } from '@prisma/client';
import { todayUtc } from '@/common/utils/date.utils';
import {
  DEFAULT_PROJECT_CONFIG,
  EMPTY_PRICING_GRID_CONTENT,
  INITIAL_PRICING_GRID_VERSION,
  ProjectConfig,
  ReferenceCategory,
} from './project-config.constants';

export type Db = Prisma.TransactionClient;

/**
 * Deep-merges a partial configuration over the generic defaults.
 * Reference item lists are concatenated (defaults first), not replaced.
 */
export function mergeProjectConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  const base = DEFAULT_PROJECT_CONFIG;
  const referenceItems: ProjectConfig['referenceItems'] = { ...base.referenceItems };
  for (const [category, items] of Object.entries(overrides.referenceItems ?? {})) {
    const key = category as ReferenceCategory;
    const existing = referenceItems[key] ?? [];
    const existingKeys = new Set(existing.map((i) => i.key));
    referenceItems[key] = [...existing, ...(items ?? []).filter((i) => !existingKeys.has(i.key))];
  }
  return {
    settings: {
      ...base.settings,
      ...overrides.settings,
      stageProbabilities: {
        ...base.settings.stageProbabilities,
        ...overrides.settings?.stageProbabilities,
      },
      company: { ...base.settings.company, ...overrides.settings?.company },
    },
    features: { ...base.features, ...overrides.features },
    referenceItems,
    scopes: overrides.scopes ?? base.scopes,
  };
}

/** Sets the enabled flag of every listed feature (missing rows are created). */
export function upsertProjectFeatures(
  db: Db,
  projectId: string,
  flags: Partial<Record<FeatureCode, boolean>>,
): Promise<ProjectFeature[]> {
  return Promise.all(
    (Object.entries(flags) as [FeatureCode, boolean][]).map(([feature, enabled]) =>
      db.projectFeature.upsert({
        where: { projectId_feature: { projectId, feature } },
        update: { enabled },
        create: { projectId, feature, enabled },
      }),
    ),
  );
}

/** Creates the scopes whose name does not exist yet on the project (idempotent). */
export async function createMissingScopes(
  db: Db,
  projectId: string,
  scopes: Omit<Prisma.ScopeCreateManyInput, 'projectId' | 'id'>[],
): Promise<void> {
  const existing = await db.scope.findMany({ where: { projectId }, select: { name: true } });
  const existingNames = new Set(existing.map((s) => s.name));
  const missing = scopes.filter((s) => !existingNames.has(s.name));
  if (missing.length) {
    await db.scope.createMany({ data: missing.map((s) => ({ projectId, ...s })) });
  }
}

/**
 * Creates everything a project needs to be usable: settings, features, reference items,
 * scopes and an empty pricing grid v1. Idempotent on reference items and features
 * (skipDuplicates / upsert) so it can be re-run on an existing project.
 */
export async function bootstrapProject(
  db: Db,
  projectId: string,
  overrides: Partial<ProjectConfig> = {},
): Promise<void> {
  const config = mergeProjectConfig(overrides);

  await db.settings.upsert({
    where: { projectId },
    create: {
      projectId,
      vatRate: config.settings.vatRate,
      revenueTarget: config.settings.revenueTarget,
      meetingTarget: config.settings.meetingTarget,
      quoteValidityDays: config.settings.quoteValidityDays,
      noticeMonths: config.settings.noticeMonths,
      defaultCommitmentMonths: config.settings.defaultCommitmentMonths,
      discountCap: config.settings.discountCap,
      retentionMonths: config.settings.retentionMonths,
      stageProbabilities: config.settings.stageProbabilities,
      company: config.settings.company,
    },
    update: {},
  });

  await upsertProjectFeatures(db, projectId, config.features);

  const referenceRows = Object.entries(config.referenceItems).flatMap(([category, items]) =>
    (items ?? []).map((item, index) => ({
      projectId,
      category,
      key: item.key,
      label: item.label,
      order: index,
      metadata: item.metadata ?? {},
    })),
  );
  if (referenceRows.length) {
    await db.referenceItem.createMany({ data: referenceRows, skipDuplicates: true });
  }

  await createMissingScopes(db, projectId, config.scopes);

  const gridCount = await db.pricingGrid.count({ where: { projectId } });
  if (gridCount === 0) {
    await db.pricingGrid.create({
      data: {
        projectId,
        version: INITIAL_PRICING_GRID_VERSION,
        effectiveDate: todayUtc(),
        active: true,
        content: EMPTY_PRICING_GRID_CONTENT,
      },
    });
  }
}
