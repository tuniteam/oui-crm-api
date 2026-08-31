import { OutOfScopeAccess, ScopeType } from '@prisma/client';
import { LEGAL_DOCUMENTS, LegalDocument } from '@/common/legal/legal.constants';
import { mapToMeResponse, UserWithAccess } from './profile.utils';

type Relation = UserWithAccess['userRoleProjects'][number];

const role = (over: Partial<Relation['role']> = {}): Relation['role'] =>
  ({
    id: 'role1',
    projectId: null,
    code: 'SALES_REP',
    label: 'Sales representative',
    isBackoffice: false,
    isSystem: true,
    outOfScopeAccess: OutOfScopeAccess.RESTRICTED,
    createdAt: new Date(),
    updatedAt: new Date(),
    permissions: [
      {
        id: 'rp1',
        roleId: 'role1',
        permissionId: 'p1',
        scope: ScopeType.OWN,
        permission: { id: 'p1', code: 'quotes:read', label: 'Read quotes' },
      },
    ],
    ...over,
  }) as Relation['role'];

const relation = (over: Partial<Relation> = {}): Relation =>
  ({
    id: 'urp1',
    userId: 'u1',
    projectId: 'p1',
    roleId: 'role1',
    scopeId: 's1',
    initials: 'WB',
    status: 'ACTIVE',
    displayOrder: 1,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    role: role(),
    project: {
      id: 'p1',
      slug: 'periscolia',
      name: 'Périscolia',
      productName: 'Périscolia',
      description: null,
      status: 'ACTIVE',
      activatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      features: [{ id: 'f1', projectId: 'p1', feature: 'SALES', enabled: true, createdAt: new Date() }],
    },
    scope: {
      id: 's1',
      projectId: 'p1',
      name: 'Normandie',
      description: '',
      regions: ['Normandie'],
      departments: ['14', '27', '50', '61', '76'],
      portfolioOnly: false,
      nature: 'ALL',
      campaignIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    ...over,
  }) as Relation;

const user = (over: Partial<UserWithAccess> = {}): UserWithAccess =>
  ({
    id: 'u1',
    email: 'u1@example.com',
    password: 'hash',
    firstName: 'Wiem',
    lastName: 'Bousaid',
    phone: null,
    status: 'ACTIVE',
    lastLoginAt: null,
    lastLoginIp: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordChangedAt: null,
    avatarFileId: null,
    cguVersion: LEGAL_DOCUMENTS[LegalDocument.CGU].version,
    cguAcceptedAt: new Date(),
    rgpdVersion: LEGAL_DOCUMENTS[LegalDocument.RGPD].version,
    rgpdAcceptedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    userRoleProjects: [relation()],
    overrides: [],
    ...over,
  }) as UserWithAccess;

describe('mapToMeResponse (SPEC-06 §6)', () => {
  it('maps a project user with its relation, scope, modules and permissions', () => {
    const me = mapToMeResponse(user(), null);
    expect(me.contactType).toBe('PROJECT');
    expect(me.initials).toBe('WB');
    expect(me.roleRelationships).toHaveLength(1);
    const rel = me.roleRelationships[0];
    expect(rel).toMatchObject({
      roleCode: 'SALES_REP',
      projectSlug: 'periscolia',
      outOfScopeAccess: 'RESTRICTED',
      modules: ['SALES'],
    });
    expect(rel.scope).toEqual({
      name: 'Normandie',
      regions: ['Normandie'],
      departments: ['14', '27', '50', '61', '76'],
      portfolioOnly: false,
    });
    expect(rel.permissions).toContainEqual({ code: 'quotes:read', scope: 'OWN', source: 'ROLE' });
    expect(me.legalReacceptanceRequired).toBe(false);
  });

  it('applies overrides to the relation permissions (removal > addition > role)', () => {
    const me = mapToMeResponse(
      user({
        overrides: [
          {
            id: 'o1',
            userId: 'u1',
            projectId: 'p1',
            permissionId: 'p1',
            granted: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            permission: { id: 'p1', code: 'quotes:read', label: '' },
          },
          {
            id: 'o2',
            userId: 'u1',
            projectId: 'p1',
            permissionId: 'p2',
            granted: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            permission: { id: 'p2', code: 'quotes:validate', label: '' },
          },
        ] as UserWithAccess['overrides'],
      }),
      null,
    );
    const perms = me.roleRelationships[0].permissions;
    expect(perms).toContainEqual({ code: 'quotes:validate', scope: 'PROJECT', source: 'OVERRIDE' });
    expect(perms.find((p) => p.code === 'quotes:read')).toBeUndefined();
  });

  it('hides suspended or expired relations', () => {
    const me = mapToMeResponse(
      user({
        userRoleProjects: [
          relation({ status: 'SUSPENDED' }),
          relation({ id: 'urp2', initials: 'XX', expiresAt: new Date('2000-01-01') }),
        ],
      }),
      null,
    );
    expect(me.roleRelationships).toHaveLength(0);
    expect(me.initials).toBeNull();
  });

  it('backoffice: contactType BACKOFFICE and never gated by legal documents', () => {
    const me = mapToMeResponse(
      user({
        cguVersion: null,
        rgpdVersion: null,
        userRoleProjects: [
          relation({
            projectId: null,
            project: null,
            scope: null,
            scopeId: null,
            initials: 'SA',
            role: role({ code: 'SUPER_ADMIN', isBackoffice: true, outOfScopeAccess: OutOfScopeAccess.FULL }),
          }),
        ],
      }),
      null,
    );
    expect(me.contactType).toBe('BACKOFFICE');
    expect(me.roleRelationships[0]).toMatchObject({ projectId: null, projectName: null, modules: [] });
    expect(me.legalReacceptanceRequired).toBe(false);
    expect(me.legalDocumentsToAccept).toEqual([]);
  });

  it('project user with outdated consents gets the documents to accept (version + url)', () => {
    const me = mapToMeResponse(user({ cguVersion: null }), null);
    expect(me.legalReacceptanceRequired).toBe(true);
    expect(me.legalDocumentsToAccept).toEqual([
      {
        code: LegalDocument.CGU,
        version: LEGAL_DOCUMENTS[LegalDocument.CGU].version,
        url: LEGAL_DOCUMENTS[LegalDocument.CGU].url,
      },
    ]);
  });
});
