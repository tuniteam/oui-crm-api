import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildPaginationMeta, paginationSkip } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/prisma/prisma.service';
import { resolveObjectLabels } from './audit-log-labels';
import { buildAuditWhere, mapToAuditItem } from './audit-log.utils';
import { AuditLogQueryDto } from './dto/query-audit-log.dto';
import { AuditLogListResponseDto, AuditUserRefDto } from './dto/response-audit-log.dto';

export interface AuditEntry {
  /** null = platform-level operation (project administration, backoffice). */
  projectId: string | null;
  userId: string | null;
  /** `object.verb`, e.g. 'project.create', 'quote.validate' (SPEC-02 §4.3). */
  action: string;
  objectType?: string;
  objectId?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Append-only journal (SPEC-02 §4.3). `log()` takes the transaction client of the operation so
 * the entry is committed with it, or rolled back with it. `findAll` serves the project journal
 * (US-00-10); the CSV export belongs to the exports module (US-05-03).
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(db: Prisma.TransactionClient | PrismaService, entry: AuditEntry): Promise<void> {
    await db.auditLog.create({
      data: {
        projectId: entry.projectId,
        userId: entry.userId,
        action: entry.action,
        objectType: entry.objectType ?? null,
        objectId: entry.objectId ?? null,
        metadata: entry.metadata,
      },
    });
  }

  /** Convenience for operations without a surrounding transaction. */
  logNow(entry: AuditEntry): Promise<void> {
    return this.log(this.prisma, entry);
  }

  /** Project journal, newest first, with actor refs and object labels resolved per page. */
  async findAll(projectId: string, query: AuditLogQueryDto): Promise<AuditLogListResponseDto> {
    const { page, limit } = query;
    const where = buildAuditWhere(projectId, query);
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where, skip: paginationSkip(page, limit), take: limit, orderBy: { createdAt: 'desc' } }),
    ]);
    const [users, objectLabels] = await Promise.all([
      this.actorRefs(projectId, rows.map((r) => r.userId)),
      resolveObjectLabels(this.prisma, projectId, rows),
    ]);
    return {
      data: rows.map((row) =>
        mapToAuditItem(row, row.userId ? (users.get(row.userId) ?? null) : null, row.objectId ? (objectLabels.get(`${row.objectType}:${row.objectId}`) ?? null) : null),
      ),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  /** Actor refs for a page; initials are those of the project (null once unassigned). */
  private async actorRefs(projectId: string, userIds: (string | null)[]): Promise<Map<string, AuditUserRefDto>> {
    const ids = [...new Set(userIds.filter((id): id is string => !!id))];
    if (ids.length === 0) return new Map();
    const [users, relations] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }),
      this.prisma.userRoleProject.findMany({ where: { projectId, userId: { in: ids } }, select: { userId: true, initials: true } }),
    ]);
    const initials = new Map(relations.map((r) => [r.userId, r.initials]));
    return new Map(users.map((u) => [u.id, { ...u, initials: initials.get(u.id) ?? null }]));
  }
}
