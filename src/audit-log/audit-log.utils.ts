import { AuditLog, Prisma } from '@prisma/client';
import { apiError } from '@/common/api-error';
import { endOfDayUtc, toDate } from '@/common/utils/date.utils';
import { AuditLogQueryDto } from './dto/query-audit-log.dto';
import { AuditLogItemDto, AuditUserRefDto } from './dto/response-audit-log.dto';

/** Project journal only; calendar-day bounds are inclusive (UTC). */
export function buildAuditWhere(projectId: string, query: AuditLogQueryDto): Prisma.AuditLogWhereInput {
  const { from, to, userId, action, objectType, objectId } = query;
  const createdAt: Prisma.DateTimeFilter = {};
  if (from) createdAt.gte = toDate(from);
  if (to) createdAt.lte = endOfDayUtc(toDate(to));
  if (createdAt.gte && createdAt.lte && createdAt.gte > createdAt.lte) throw apiError.badRequest('INVALID_DATA');
  return {
    projectId,
    ...(from || to ? { createdAt } : {}),
    ...(userId ? { userId } : {}),
    ...(action ? { action } : {}),
    ...(objectType ? { objectType } : {}),
    ...(objectId ? { objectId } : {}),
  };
}

export function mapToAuditItem(row: AuditLog, user: AuditUserRefDto | null, objectLabel: string | null): AuditLogItemDto {
  return {
    id: row.id,
    createdAt: row.createdAt,
    user,
    action: row.action,
    objectType: row.objectType,
    objectId: row.objectId,
    objectLabel,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  };
}
