import { AuditLog } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { registerLabelResolver, resolveObjectLabels } from './audit-log-labels';
import { AUDIT_OBJECTS } from './audit-log.constants';
import { buildAuditWhere, mapToAuditItem } from './audit-log.utils';
import { AuditLogQueryDto } from './dto/query-audit-log.dto';

const query = (overrides: Partial<AuditLogQueryDto> = {}): AuditLogQueryDto => ({ page: 1, limit: 20, ...overrides });

describe('audit-log.utils — filters', () => {
  it('always scopes to the project and adds only the given filters', () => {
    expect(buildAuditWhere('p1', query())).toEqual({ projectId: 'p1' });
    expect(buildAuditWhere('p1', query({ userId: 'u1', action: 'user.suspend', objectType: 'User', objectId: 'o1' }))).toEqual({
      projectId: 'p1',
      userId: 'u1',
      action: 'user.suspend',
      objectType: 'User',
      objectId: 'o1',
    });
  });

  it('calendar-day bounds are inclusive in UTC', () => {
    const where = buildAuditWhere('p1', query({ from: '2026-08-01', to: '2026-08-31' }));
    expect(where.createdAt).toEqual({
      gte: new Date('2026-08-01T00:00:00.000Z'),
      lte: new Date('2026-08-31T23:59:59.999Z'),
    });
    expect(buildAuditWhere('p1', query({ to: '2026-08-31' })).createdAt).toEqual({ lte: new Date('2026-08-31T23:59:59.999Z') });
  });

  it('rejects from > to', () => {
    expect(() => buildAuditWhere('p1', query({ from: '2026-09-02', to: '2026-09-01' }))).toThrow(expect.objectContaining({ status: 400 }));
  });

  it('maps a row with its actor ref and resolved label; null metadata stays null', () => {
    const row = {
      id: 'a1',
      projectId: 'p1',
      userId: 'u1',
      action: 'scope.create',
      objectType: 'Scope',
      objectId: 's1',
      metadata: null,
      createdAt: new Date('2026-09-01T10:00:00.000Z'),
    } as AuditLog;
    expect(mapToAuditItem(row, { id: 'u1', firstName: 'A', lastName: 'B', initials: 'AB' }, 'Normandie')).toEqual({
      id: 'a1',
      createdAt: row.createdAt,
      user: { id: 'u1', firstName: 'A', lastName: 'B', initials: 'AB' },
      action: 'scope.create',
      objectType: 'Scope',
      objectId: 's1',
      objectLabel: 'Normandie',
      metadata: null,
    });
  });
});

describe('audit-log-labels', () => {
  it('resolves labels per object type through the registry; unknown types and missing objects give no label', async () => {
    const scopeFindMany = jest.fn().mockResolvedValue([{ id: 's1', name: 'Normandie' }]);
    const db = { scope: { findMany: scopeFindMany } } as unknown as PrismaService;
    registerLabelResolver('Quote' as never, async (_db, _p, ids) => new Map(ids.map((id) => [id, `DEV-${id}`])));

    const labels = await resolveObjectLabels(db, 'p1', [
      { objectType: AUDIT_OBJECTS.SCOPE, objectId: 's1' },
      { objectType: AUDIT_OBJECTS.SCOPE, objectId: 's-deleted' },
      { objectType: 'Quote', objectId: 'q1' },
      { objectType: 'Unknown', objectId: 'x' },
      { objectType: null, objectId: null },
    ]);

    expect(scopeFindMany).toHaveBeenCalledTimes(1);
    expect(labels.get('Scope:s1')).toBe('Normandie');
    expect(labels.has('Scope:s-deleted')).toBe(false);
    expect(labels.get('Quote:q1')).toBe('DEV-q1');
    expect(labels.has('Unknown:x')).toBe(false);
  });
});
