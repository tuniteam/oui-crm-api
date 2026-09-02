import { Activity, ActivityStatus, Campaign, Contact, Organization, Prisma, PrismaClient } from '@prisma/client';
import { apiError } from '@/common/api-error';
import { REFERENCE_CATEGORIES } from '@/common/messages';
import { endOfDayUtc, formatDateField, toDate } from '@/common/utils/date.utils';
import { fullName } from '@/common/utils/user.utils';
import { UserWithInitials } from '@/audit-log/audit-log-labels';
import { ReferenceRefDto, UserRefDto } from '@/organizations/dto';
import { ICS } from './activities.constants';
import { ActivityDto } from './dto/response-activity.dto';
import { ActivityListQueryDto } from './dto/query-activity-list.dto';

type Db = Pick<PrismaClient, 'activity' | 'referenceItem' | 'organization'> | Prisma.TransactionClient;

export const ACTIVITY_REFS = {
  organization: { select: { id: true, name: true, salesStatus: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  campaign: { select: { id: true, name: true } },
} satisfies Prisma.ActivityInclude;

export type ActivityWithRefs = Activity & {
  organization: Pick<Organization, 'id' | 'name' | 'salesStatus'>;
  contact: Pick<Contact, 'id' | 'firstName' | 'lastName'> | null;
  campaign: Pick<Campaign, 'id' | 'name'> | null;
};

/**
 * 404 for an unknown or other-project activity — and for another user's activity when the
 * caller is OWN-scoped: the scope fragment is part of the lookup, an out-of-scope activity
 * does not exist for them.
 */
export async function getActivityOrThrow(
  db: Db,
  id: string,
  projectId: string,
  scopeWhere: Record<string, unknown>,
): Promise<ActivityWithRefs> {
  const activity = await db.activity.findFirst({
    where: { id, projectId, ...(scopeWhere as Prisma.ActivityWhereInput) },
    include: ACTIVITY_REFS,
  });
  if (!activity) throw apiError.notFound('ACTIVITY_NOT_FOUND', id);
  return activity as ActivityWithRefs;
}

/** History never changes: only a PLANNED activity can be edited, completed or cancelled. */
export function assertPlanned(activity: Activity): void {
  if (activity.status !== ActivityStatus.PLANNED) throw apiError.conflict('ACTIVITY_ALREADY_CLOSED');
}

export function buildActivityWhere(
  projectId: string,
  filters: Pick<ActivityListQueryDto, 'organizationId' | 'userId' | 'status' | 'type' | 'from' | 'to'>,
  scopeWhere: Record<string, unknown>,
): Prisma.ActivityWhereInput {
  const date: Prisma.DateTimeFilter = {};
  if (filters.from) date.gte = toDate(filters.from);
  if (filters.to) date.lte = endOfDayUtc(toDate(filters.to));
  return {
    projectId,
    ...(scopeWhere as Prisma.ActivityWhereInput),
    ...(filters.organizationId ? { organizationId: filters.organizationId } : {}),
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.from || filters.to ? { date } : {}),
  };
}

/** Labels of the reference keys used by a page of activities (one query). */
export async function loadActivityLabels(
  db: Db,
  projectId: string,
  rows: Pick<Activity, 'type' | 'result'>[],
): Promise<Map<string, string>> {
  const checks = [
    ...new Set([
      ...rows.map((r) => `${REFERENCE_CATEGORIES.ACTIVITY_TYPE}:${r.type}`),
      ...rows.filter((r) => r.result).map((r) => `${REFERENCE_CATEGORIES.ACTIVITY_RESULT}:${r.result}`),
    ]),
  ].map((entry) => {
    const [category, key] = entry.split(':');
    return { category, key };
  });
  if (!checks.length) return new Map();
  const items = await db.referenceItem.findMany({
    where: { projectId, OR: checks },
    select: { category: true, key: true, label: true, metadata: true },
  });
  return new Map(items.map((i) => [`${i.category}:${i.key}`, i.label]));
}

/** The ACTIVITY_TYPE row of a key; 400 INVALID_REFERENCE_VALUE when the project ignores it. */
export async function getActivityTypeOrThrow(
  db: Db,
  projectId: string,
  type: string,
): Promise<{ label: string; ics: boolean; defaultDurationMin: number | null }> {
  const item = await db.referenceItem.findFirst({
    where: { projectId, category: REFERENCE_CATEGORIES.ACTIVITY_TYPE, key: type, active: true },
    select: { label: true, metadata: true },
  });
  if (!item) throw apiError.badRequest('INVALID_REFERENCE_VALUE', REFERENCE_CATEGORIES.ACTIVITY_TYPE, type);
  const metadata = (item.metadata ?? {}) as { ics?: boolean; defaultDurationMin?: number };
  return { label: item.label, ics: metadata.ics === true, defaultDurationMin: metadata.defaultDurationMin ?? null };
}

export function mapToActivity(
  row: ActivityWithRefs,
  user: UserWithInitials | undefined,
  labels: Map<string, string>,
): ActivityDto {
  return {
    id: row.id,
    organization: { id: row.organization.id, name: row.organization.name },
    contact: row.contact ? { id: row.contact.id, fullName: fullName(row.contact) } : null,
    user: userRef(user, row.userId),
    type: { key: row.type, label: labels.get(`${REFERENCE_CATEGORIES.ACTIVITY_TYPE}:${row.type}`) ?? null },
    date: formatDateField(row.date),
    time: row.time,
    durationMin: row.durationMin,
    location: row.location,
    status: row.status,
    report: row.report,
    result: row.result
      ? { key: row.result, label: labels.get(`${REFERENCE_CATEGORIES.ACTIVITY_RESULT}:${row.result}`) ?? null }
      : null,
    campaign: row.campaign,
    completedAt: row.completedAt,
  };
}

export function userRef(user: UserWithInitials | undefined, id: string): UserRefDto {
  return user ? { id: user.id, fullName: fullName(user), initials: user.initials ?? null } : { id, fullName: '', initials: null };
}

/**
 * lastActivityAt = latest DONE, nextActivityAt = earliest PLANNED (an overdue planned
 * activity stays the "next" one — that is what the late dashboards show). Recomputed, never
 * incremented: cancelling, deleting or rescheduling stays exact (SPEC-13 P5).
 */
export async function recomputeActivityMarks(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
  const [last, next] = await Promise.all([
    tx.activity.aggregate({ where: { organizationId, status: ActivityStatus.DONE }, _max: { date: true } }),
    tx.activity.aggregate({ where: { organizationId, status: ActivityStatus.PLANNED }, _min: { date: true } }),
  ]);
  await tx.organization.update({
    where: { id: organizationId },
    data: { lastActivityAt: last._max.date, nextActivityAt: next._min.date },
  });
}

// ---- ICS (US-01-09) ---------------------------------------------------------------------

const icsEscape = (s: string): string => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/**
 * One VEVENT in floating local time (no timezone — SPEC-13 D9): 14:30 stays 14:30 in the
 * user's calendar. Without a time the event is an all-day entry.
 */
export function buildIcs(
  activity: ActivityWithRefs,
  typeLabel: string,
  defaultDurationMin: number | null,
): { content: string; filename: string } {
  const day = formatDateField(activity.date).replace(/-/g, '');
  const dtStart = activity.time
    ? `DTSTART:${day}T${activity.time.replace(':', '')}00`
    : `DTSTART;VALUE=DATE:${day}`;
  const duration = activity.time ? `DURATION:PT${activity.durationMin ?? defaultDurationMin ?? ICS.DEFAULT_DURATION_MIN}M` : null;
  const summary = `${typeLabel} — ${activity.organization.name}`;
  const description = [activity.contact ? fullName(activity.contact) : null, activity.report].filter(Boolean).join('\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${ICS.PROD_ID}`,
    'BEGIN:VEVENT',
    `UID:${activity.id}@oui-crm`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`,
    dtStart,
    ...(duration ? [duration] : []),
    `SUMMARY:${icsEscape(summary)}`,
    ...(activity.location ? [`LOCATION:${icsEscape(activity.location)}`] : []),
    ...(description ? [`DESCRIPTION:${icsEscape(description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return { content: lines.join('\r\n') + '\r\n', filename: `${typeLabel.toLowerCase().replace(/\s+/g, '-')}-${formatDateField(activity.date)}.ics` };
}
