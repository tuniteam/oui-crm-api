import { Prisma, ReferenceItem } from '@prisma/client';
import { apiError } from '@/common/api-error';
import { PrismaService } from '@/prisma/prisma.service';
import { ReferenceCategory } from '@/projects/project-config.constants';
import { ReferenceItemResponseDto } from './dto/response-reference-item.dto';
import { REFERENCE_USAGE_COUNTERS } from './reference-items.constants';

export async function getReferenceItemOrThrow(prisma: PrismaService, projectId: string, id: string): Promise<ReferenceItem> {
  const item = await prisma.referenceItem.findFirst({ where: { id, projectId } });
  if (!item) throw apiError.notFound('REFERENCE_ITEM_NOT_FOUND', id);
  return item;
}

/** key → usage count for one category; empty map when no counter is registered (L0). */
export function usageCounts(
  db: PrismaService | Prisma.TransactionClient,
  projectId: string,
  category: string,
): Promise<Map<string, number>> {
  const counter = REFERENCE_USAGE_COUNTERS[category as ReferenceCategory];
  return counter ? counter(db, projectId) : Promise.resolve(new Map());
}

export function mapToReferenceItemResponse(item: ReferenceItem, usageCount: number): ReferenceItemResponseDto {
  return {
    id: item.id,
    category: item.category,
    key: item.key,
    label: item.label,
    order: item.order,
    active: item.active,
    metadata: (item.metadata ?? {}) as Record<string, unknown>,
    usageCount,
  };
}
