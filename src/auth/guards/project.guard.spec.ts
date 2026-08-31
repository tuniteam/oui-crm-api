import { BadRequestException, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OutOfScopeAccess, ProjectStatus, ScopeType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PROJECT_SCOPED_KEY } from '../decorators/project-scoped.decorator';
import { AuthenticatedRelation, AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { ProjectGuard } from './project.guard';

const relation = (partial: Partial<AuthenticatedRelation>): AuthenticatedRelation => ({
  roleId: 'r',
  roleCode: 'SALES_REP',
  isBackoffice: false,
  outOfScopeAccess: OutOfScopeAccess.RESTRICTED,
  projectId: 'p1',
  projectName: 'Périscolia',
  projectSlug: 'periscolia',
  scopeId: null,
  initials: 'WB',
  expiresAt: null,
  permissions: [],
  features: [],
  ...partial,
});

const principal = (relations: AuthenticatedRelation[]): AuthenticatedUser => ({
  id: 'u1',
  email: 'u1@example.com',
  firstName: 'U',
  lastName: 'One',
  sessionId: 's1',
  relations,
});

function contextFor(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => 'handler',
    getClass: () => 'class',
  } as unknown as ExecutionContext;
}

describe('ProjectGuard (SPEC-02 §4.1)', () => {
  let reflector: { getAllAndOverride: jest.Mock; get: jest.Mock };
  let prisma: { project: { findFirst: jest.Mock } };
  let guard: ProjectGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn(), get: jest.fn() };
    prisma = { project: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', status: ProjectStatus.ACTIVE }) } };
    guard = new ProjectGuard(reflector as unknown as Reflector, prisma as unknown as PrismaService);
    reflector.getAllAndOverride.mockImplementation((key: string) => key === PROJECT_SCOPED_KEY);
    reflector.get.mockImplementation((key: string) =>
      key === PERMISSIONS_KEY ? [{ code: 'quotes:read' }] : undefined,
    );
  });

  it('rejects an unauthenticated request', async () => {
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('lets non project-scoped routes through without a header', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const req = { headers: {}, user: principal([]) };
    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
  });

  it('400 PROJECT_IS_REQUIRED when the header is missing on a scoped route', async () => {
    const req = { headers: {}, user: principal([relation({})]) };
    await expect(guard.canActivate(contextFor(req))).rejects.toMatchObject({
      constructor: BadRequestException,
      response: { code: 'PROJECT_IS_REQUIRED' },
    });
  });

  it('403 USER_HAS_NO_PROJECT when the caller has no project relation', async () => {
    const req = { headers: { 'x-project-id': 'p1' }, user: principal([]) };
    await expect(guard.canActivate(contextFor(req))).rejects.toMatchObject({
      constructor: ForbiddenException,
      response: { code: 'USER_HAS_NO_PROJECT' },
    });
  });

  it('403 PROJECT_MISMATCH when the header is not one of the caller projects', async () => {
    const req = { headers: { 'x-project-id': 'p2' }, user: principal([relation({})]) };
    await expect(guard.canActivate(contextFor(req))).rejects.toMatchObject({
      response: { code: 'PROJECT_MISMATCH' },
    });
  });

  it('sets req.projectId for a member of an ACTIVE project', async () => {
    const req: Record<string, unknown> = { headers: { 'x-project-id': 'p1' }, user: principal([relation({})]) };
    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    expect(req.projectId).toBe('p1');
  });

  it.each([ProjectStatus.DRAFT, ProjectStatus.ARCHIVED])(
    '403 PROJECT_NOT_ACTIVE for a member when the project is %s',
    async (status) => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p1', status });
      const req = { headers: { 'x-project-id': 'p1' }, user: principal([relation({})]) };
      await expect(guard.canActivate(contextFor(req))).rejects.toMatchObject({
        constructor: ForbiddenException,
        response: { code: 'PROJECT_NOT_ACTIVE' },
      });
    },
  );

  describe('backoffice with an ALL grant on the route permission', () => {
    const superAdmin = principal([
      relation({
        isBackoffice: true,
        projectId: null,
        permissions: [{ code: 'quotes:read', scope: ScopeType.ALL, source: 'ROLE' }],
      }),
    ]);

    it('may address any existing project', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p9' });
      const req: Record<string, unknown> = { headers: { 'x-project-id': 'p9' }, user: superAdmin };
      await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
      expect(req.projectId).toBe('p9');
      expect(prisma.project.findFirst).toHaveBeenCalledWith({ where: { id: 'p9' }, select: { id: true } });
    });

    it('403 PROJECT_MISMATCH when the project does not exist', async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      const req = { headers: { 'x-project-id': 'ghost' }, user: superAdmin };
      await expect(guard.canActivate(contextFor(req))).rejects.toMatchObject({
        response: { code: 'PROJECT_MISMATCH' },
      });
    });
  });
});
