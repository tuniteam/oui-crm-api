import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { apiError } from '@/common/api-error';
import { PRISMA_ERROR } from '@/common/constants/app.constants';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateReferenceItemDto, ReferenceItemIdResponseDto } from './dto/create-reference-item.dto';
import { QueryReferenceItemsDto } from './dto/query-reference-items.dto';
import { ReferenceItemResponseDto, ReferenceItemsListResponseDto } from './dto/response-reference-item.dto';
import { UpdateReferenceItemDto } from './dto/update-reference-item.dto';
import { REFERENCE_ITEMS_AUDIT } from './reference-items.constants';
import { getReferenceItemOrThrow, mapToReferenceItemResponse, usageCounts } from './reference-items.utils';

/** US-00-09 — reference values (pick-lists) of a project. No delete: a used value is deactivated. */
@Injectable()
export class ReferenceItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async findAll(projectId: string, query: QueryReferenceItemsDto): Promise<ReferenceItemsListResponseDto> {
    const items = await this.prisma.referenceItem.findMany({
      where: { projectId, ...(query.category ? { category: query.category } : {}) },
      orderBy: [{ category: 'asc' }, { order: 'asc' }, { label: 'asc' }],
    });
    const categories = [...new Set(items.map((i) => i.category))];
    const counts = new Map(
      await Promise.all(categories.map(async (c) => [c, await usageCounts(this.prisma, projectId, c)] as const)),
    );
    return { data: items.map((i) => mapToReferenceItemResponse(i, counts.get(i.category)?.get(i.key) ?? 0)) };
  }

  async create(projectId: string, dto: CreateReferenceItemDto, actor: AuthenticatedUser): Promise<ReferenceItemIdResponseDto> {
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const order = dto.order ?? (await nextOrder(tx, projectId, dto.category));
        const row = await tx.referenceItem.create({
          data: {
            projectId,
            category: dto.category,
            key: dto.key,
            label: dto.label,
            order,
            metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
        await this.audit.log(tx, {
          projectId,
          userId: actor.id,
          action: REFERENCE_ITEMS_AUDIT.CREATE,
          objectType: AUDIT_OBJECTS.REFERENCE_ITEM,
          objectId: row.id,
          metadata: { category: row.category, key: row.key },
        });
        return row;
      });
      return { id: created.id, key: created.key };
    } catch (error) {
      // (projectId, category, key) unique index — the only race a concurrent create can lose
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === PRISMA_ERROR.UNIQUE_VIOLATION) {
        throw apiError.conflict('REFERENCE_KEY_EXISTS');
      }
      throw error;
    }
  }

  async update(projectId: string, id: string, dto: UpdateReferenceItemDto, actor: AuthenticatedUser): Promise<ReferenceItemResponseDto> {
    if (Object.keys(dto).length === 0) throw apiError.badRequest('EMPTY_UPDATE_PAYLOAD');
    await getReferenceItemOrThrow(this.prisma, projectId, id);

    const { metadata, ...rest } = dto;
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.referenceItem.update({
        where: { id },
        data: { ...rest, ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {}) },
      });
      await this.audit.log(tx, {
        projectId,
        userId: actor.id,
        action: REFERENCE_ITEMS_AUDIT.UPDATE,
        objectType: AUDIT_OBJECTS.REFERENCE_ITEM,
        objectId: id,
        metadata: { category: row.category, key: row.key, fields: Object.keys(dto) },
      });
      return row;
    });
    const counts = await usageCounts(this.prisma, projectId, updated.category);
    return mapToReferenceItemResponse(updated, counts.get(updated.key) ?? 0);
  }
}

/** Default display order of a new value: after the last one of its category. */
async function nextOrder(tx: Prisma.TransactionClient, projectId: string, category: string): Promise<number> {
  const { _max } = await tx.referenceItem.aggregate({ where: { projectId, category }, _max: { order: true } });
  return (_max.order ?? -1) + 1;
}
