import { Injectable } from '@nestjs/common';
import { FeatureCode, FileCategory, FileOwnerType, Prisma } from '@prisma/client';
import { buildFileCreateData } from '@/files/files.utils';
import { StorageService } from '@/storage/storage.service';
import {
  bootstrapProject,
  createMissingScopes,
  Db,
  upsertProjectFeatures,
} from './project-bootstrap';
import { INITIAL_PRICING_GRID_VERSION } from './project-config.constants';
import { getProjectOrThrow } from './projects.utils';

/** Files that belong to the configuration of a project (SPEC-10 §3.4). */
const CONFIG_FILE_CATEGORIES: FileCategory[] = [FileCategory.HTML_TEMPLATE, FileCategory.SIGNATURE_IMAGE];

/**
 * SPEC-10 §3.1 / §3.4 — makes a new project usable (generic defaults) and, optionally, copies
 * the configuration of another project: settings except company identity, stage
 * probabilities, features, reference items, scopes, active pricing grid (as version 1),
 * HTML templates and stamp. Never organizations, users, quotes or contracts.
 */
@Injectable()
export class ProjectBootstrapService {
  constructor(private readonly storage: StorageService) {}

  bootstrap(db: Db, projectId: string): Promise<void> {
    return bootstrapProject(db, projectId);
  }

  async copyConfiguration(db: Db, sourceId: string, targetId: string, userId: string): Promise<void> {
    await getProjectOrThrow(db, sourceId);
    const source = await db.project.findFirstOrThrow({
      where: { id: sourceId },
      include: {
        settings: true,
        features: true,
        referenceItems: true,
        scopes: true,
        pricingGrids: { where: { active: true }, orderBy: { version: 'desc' }, take: 1 },
        files: { where: { ownerType: FileOwnerType.PROJECT, category: { in: CONFIG_FILE_CATEGORIES } } },
      },
    });

    if (source.settings) {
      const { id: _id, projectId: _p, company: _c, createdAt: _ca, updatedAt: _ua, ...values } = source.settings;
      await db.settings.update({
        where: { projectId: targetId },
        data: { ...values, stageProbabilities: values.stageProbabilities as Prisma.InputJsonValue },
      });
    }

    await upsertProjectFeatures(
      db,
      targetId,
      Object.fromEntries(source.features.map((f) => [f.feature, f.enabled])) as Partial<
        Record<FeatureCode, boolean>
      >,
    );

    await Promise.all(
      source.referenceItems.map((item) =>
        db.referenceItem.upsert({
          where: { projectId_category_key: { projectId: targetId, category: item.category, key: item.key } },
          update: { label: item.label, order: item.order, active: item.active, metadata: item.metadata as Prisma.InputJsonValue },
          create: {
            projectId: targetId,
            category: item.category,
            key: item.key,
            label: item.label,
            order: item.order,
            active: item.active,
            metadata: item.metadata as Prisma.InputJsonValue,
          },
        }),
      ),
    );

    await createMissingScopes(
      db,
      targetId,
      source.scopes.map((s) => ({
        name: s.name,
        description: s.description,
        regions: s.regions,
        departments: s.departments,
        portfolioOnly: s.portfolioOnly,
        nature: s.nature,
        campaignIds: [],
      })),
    );

    const activeGrid = source.pricingGrids[0];
    if (activeGrid) {
      await db.pricingGrid.update({
        where: { projectId_version: { projectId: targetId, version: INITIAL_PRICING_GRID_VERSION } },
        data: { content: activeGrid.content as Prisma.InputJsonValue, active: true, createdById: userId },
      });
    }

    const copiedPaths = await Promise.all(
      source.files.map((file) =>
        this.storage.copyObject(
          file.filePath,
          { type: 'ENTITY_FILE', projectId: targetId, ownerType: FileOwnerType.PROJECT, ownerId: targetId, category: file.category },
          file.fileName,
        ),
      ),
    );
    if (source.files.length) {
      await db.file.createMany({
        data: source.files.map((file, i) =>
          buildFileCreateData({
            projectId: targetId,
            ownerType: FileOwnerType.PROJECT,
            ownerId: targetId,
            category: file.category,
            fileName: file.fileName,
            filePath: copiedPaths[i],
            fileSize: file.fileSize,
            mimeType: file.mimeType,
            uploadedBy: userId,
            note: file.note,
          }),
        ),
      });
    }
  }
}
