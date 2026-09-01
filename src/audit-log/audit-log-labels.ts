import { Prisma } from '@prisma/client';
import { labels } from '@/common/messages';
import { PrismaService } from '@/prisma/prisma.service';
import { fullName } from '@/common/utils/user.utils';
import { AUDIT_OBJECTS, AuditObjectType } from './audit-log.constants';

type Db = PrismaService | Prisma.TransactionClient;

/** objectId → human label for the rows of one object type (one query per type and page). */
export type LabelResolver = (db: Db, projectId: string, ids: string[]) => Promise<Map<string, string>>;

/**
 * Registry of label resolvers by object type — the `Référence` column of the V8 journal.
 * L0 objects are resolved here with plain selects; later lots register theirs
 * (`Organization` → name, `Quote` → number…) from their own module through
 * `registerLabelResolver`. A deleted object or a type without resolver → null label.
 */
export interface UserWithInitials {
  id: string;
  firstName: string;
  lastName: string;
  /** Initials on this project; undefined once unassigned. */
  initials?: string;
}

/** Identity + project initials for a set of user ids (actor refs and User labels share it). */
export async function loadUsersWithInitials(db: Db, projectId: string, ids: string[]): Promise<Map<string, UserWithInitials>> {
  const [users, relations] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }),
    db.userRoleProject.findMany({ where: { projectId, userId: { in: ids } }, select: { userId: true, initials: true } }),
  ]);
  const initials = new Map(relations.map((r) => [r.userId, r.initials]));
  return new Map(users.map((u) => [u.id, { ...u, initials: initials.get(u.id) }]));
}

const resolvers: Partial<Record<AuditObjectType, LabelResolver>> = {
  [AUDIT_OBJECTS.USER]: async (db, projectId, ids) => {
    const users = await loadUsersWithInitials(db, projectId, ids);
    return new Map([...users.values()].map((u) => [u.id, userLabel(u, u.initials)]));
  },
  [AUDIT_OBJECTS.PROJECT]: async (db, _projectId, ids) =>
    new Map((await db.project.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((p) => [p.id, p.name])),
  [AUDIT_OBJECTS.ROLE]: async (db, projectId, ids) =>
    new Map(
      (await db.role.findMany({ where: { id: { in: ids }, OR: [{ projectId }, { projectId: null }] }, select: { id: true, label: true } })).map((r) => [r.id, r.label]),
    ),
  [AUDIT_OBJECTS.SCOPE]: async (db, projectId, ids) =>
    new Map((await db.scope.findMany({ where: { id: { in: ids }, projectId }, select: { id: true, name: true } })).map((s) => [s.id, s.name])),
  [AUDIT_OBJECTS.SETTINGS]: async (_db, _projectId, ids) => new Map(ids.map((id) => [id, labels.auditObjects.settings])),
  [AUDIT_OBJECTS.FILE]: async (db, projectId, ids) =>
    new Map((await db.file.findMany({ where: { id: { in: ids }, projectId }, select: { id: true, fileName: true } })).map((f) => [f.id, f.fileName])),
  [AUDIT_OBJECTS.REFERENCE_ITEM]: async (db, projectId, ids) =>
    new Map(
      (await db.referenceItem.findMany({ where: { id: { in: ids }, projectId }, select: { id: true, category: true, label: true } })).map((r) => [
        r.id,
        `${r.category} · ${r.label}`,
      ]),
    ),
};

/** "Wiem Bousaid (WB)" — initials only when the user is (still) assigned to the project. */
function userLabel(user: { firstName: string; lastName: string }, initials?: string): string {
  return initials ? `${fullName(user)} (${initials})` : fullName(user);
}

export function registerLabelResolver(objectType: AuditObjectType, resolver: LabelResolver): void {
  resolvers[objectType] = resolver;
}

/** Resolves `objectType:objectId` → label for a page of rows, grouped by type. */
export async function resolveObjectLabels(
  db: Db,
  projectId: string,
  rows: { objectType: string | null; objectId: string | null }[],
): Promise<Map<string, string>> {
  const idsByType = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.objectType || !row.objectId) continue;
    const set = idsByType.get(row.objectType) ?? new Set<string>();
    set.add(row.objectId);
    idsByType.set(row.objectType, set);
  }
  const out = new Map<string, string>();
  await Promise.all(
    [...idsByType].map(async ([type, ids]) => {
      const resolver = resolvers[type as AuditObjectType];
      if (!resolver) return;
      for (const [id, label] of await resolver(db, projectId, [...ids])) out.set(`${type}:${id}`, label);
    }),
  );
  return out;
}
