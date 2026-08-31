// ============================================
// OUI-CRM - Seed: permissions, system roles, role ↔ permission matrix
// Source of truth: docs/SPEC-06-PERMISSIONS.md §3-4. Runs on every deployment.
// ============================================

import { OutOfScopeAccess, PrismaClient, ScopeType } from '@prisma/client';
import { UserRole } from '../src/auth/enums/user-role.enum';

/**
 * Permission catalogue: module → actions (SPEC-06 §3).
 */
export const PERMISSION_CATALOGUE = {
  organizations: ['read', 'create', 'update', 'delete', 'export', 'import', 'bulk'],
  contacts: ['read', 'create', 'update', 'delete'],
  activities: ['read', 'create', 'update', 'delete'],
  campaigns: ['read', 'create', 'update', 'delete'],
  opportunities: ['read', 'create', 'update', 'delete'],
  quotes: ['read', 'create', 'update', 'delete', 'submit', 'validate', 'sign', 'discountAboveCap'],
  contracts: ['read', 'update'],
  invoices: ['read', 'create', 'update', 'chorus'],
  deployments: ['read', 'update'],
  trainings: ['read', 'create', 'update', 'delete'],
  tickets: ['read', 'create', 'update', 'delete'],
  dashboard: ['read'],
  stats: ['read', 'export'],
  pricing: ['read', 'update'],
  settings: ['read', 'update'],
  references: ['read', 'update'],
  users: ['read', 'create', 'update', 'delete'],
  roles: ['read', 'update'],
  scopes: ['read', 'update'],
  auditLog: ['read', 'export'],
  data: ['export', 'restore', 'purge'],
  projects: ['read', 'create', 'update'],
} as const satisfies Record<string, readonly string[]>;

type Module = keyof typeof PERMISSION_CATALOGUE;
type Action = (typeof PERMISSION_CATALOGUE)[Module][number];

const ACTION_LABELS: Record<Action, string> = {
  read: 'Read',
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  export: 'Export',
  import: 'Import',
  bulk: 'Bulk actions on',
  submit: 'Submit',
  validate: 'Validate',
  sign: 'Sign',
  discountAboveCap: 'Grant a discount above the cap on',
  chorus: 'Record Chorus Pro deposit for',
  restore: 'Restore',
  purge: 'Purge',
};

export const permissionsData: { code: string; label: string }[] = Object.entries(
  PERMISSION_CATALOGUE,
).flatMap(([module, actions]) =>
  actions.map((action) => ({
    code: `${module}:${action}`,
    label: `${ACTION_LABELS[action as Action]} ${module}`,
  })),
);

/**
 * System roles (SPEC-06 §4.1).
 */
export const rolesData = [
  { code: UserRole.SUPER_ADMIN, label: 'Platform administrator', isBackoffice: true, outOfScopeAccess: OutOfScopeAccess.FULL },
  { code: UserRole.PROJECT_ADMIN, label: 'Project administrator', isBackoffice: false, outOfScopeAccess: OutOfScopeAccess.FULL },
  { code: UserRole.SALES_DIRECTOR, label: 'Sales director', isBackoffice: false, outOfScopeAccess: OutOfScopeAccess.FULL },
  { code: UserRole.SALES_REP, label: 'Sales representative', isBackoffice: false, outOfScopeAccess: OutOfScopeAccess.RESTRICTED },
  { code: UserRole.DEPLOYMENT_CONSULTANT, label: 'Deployment consultant', isBackoffice: false, outOfScopeAccess: OutOfScopeAccess.NONE },
  { code: UserRole.TRAINER, label: 'Trainer', isBackoffice: false, outOfScopeAccess: OutOfScopeAccess.NONE },
  { code: UserRole.BILLING_ADMIN, label: 'Billing administrator', isBackoffice: false, outOfScopeAccess: OutOfScopeAccess.RESTRICTED },
  { code: UserRole.OBSERVER, label: 'Observer', isBackoffice: false, outOfScopeAccess: OutOfScopeAccess.NONE },
];

type Grant = { role: UserRole; permission: string; scope: ScopeType };

const P = ScopeType.PROJECT;
const O = ScopeType.OWN;

function grant(role: UserRole, module: Module, actions: readonly string[], scope: ScopeType): Grant[] {
  return actions.map((action) => ({ role, permission: `${module}:${action}`, scope }));
}

const R = ['read'] as const;
const RU = ['read', 'update'] as const;
const RCU = ['read', 'create', 'update'] as const;
const RCUD = ['read', 'create', 'update', 'delete'] as const;

/**
 * Role ↔ permission ↔ scope matrix (SPEC-06 §4.2-4.3, validated 31/08/2026).
 * SUPER_ADMIN gets every permission with scope ALL (added programmatically).
 */
export const rolePermMapping: Grant[] = [
  // ---------- PROJECT_ADMIN : everything on the project ----------
  ...grant(UserRole.PROJECT_ADMIN, 'organizations', PERMISSION_CATALOGUE.organizations, P),
  ...grant(UserRole.PROJECT_ADMIN, 'contacts', RCUD, P),
  ...grant(UserRole.PROJECT_ADMIN, 'activities', RCUD, P),
  ...grant(UserRole.PROJECT_ADMIN, 'campaigns', RCUD, P),
  ...grant(UserRole.PROJECT_ADMIN, 'opportunities', RCUD, P),
  ...grant(UserRole.PROJECT_ADMIN, 'quotes', PERMISSION_CATALOGUE.quotes, P),
  ...grant(UserRole.PROJECT_ADMIN, 'contracts', RU, P),
  ...grant(UserRole.PROJECT_ADMIN, 'invoices', PERMISSION_CATALOGUE.invoices, P),
  ...grant(UserRole.PROJECT_ADMIN, 'deployments', RU, P),
  ...grant(UserRole.PROJECT_ADMIN, 'trainings', RCUD, P),
  ...grant(UserRole.PROJECT_ADMIN, 'tickets', RCUD, P),
  ...grant(UserRole.PROJECT_ADMIN, 'dashboard', R, P),
  ...grant(UserRole.PROJECT_ADMIN, 'stats', ['read', 'export'], P),
  ...grant(UserRole.PROJECT_ADMIN, 'pricing', RU, P),
  ...grant(UserRole.PROJECT_ADMIN, 'settings', RU, P),
  ...grant(UserRole.PROJECT_ADMIN, 'references', RU, P),
  ...grant(UserRole.PROJECT_ADMIN, 'scopes', RU, P),
  ...grant(UserRole.PROJECT_ADMIN, 'roles', RU, P),
  ...grant(UserRole.PROJECT_ADMIN, 'users', RCUD, P),
  ...grant(UserRole.PROJECT_ADMIN, 'auditLog', ['read', 'export'], P),
  ...grant(UserRole.PROJECT_ADMIN, 'data', ['export', 'restore', 'purge'], P),

  // ---------- SALES_DIRECTOR : all amounts, validates discounts, no base export, no pricing edit ----------
  ...grant(UserRole.SALES_DIRECTOR, 'organizations', ['read', 'create', 'update', 'delete', 'import', 'bulk'], P),
  ...grant(UserRole.SALES_DIRECTOR, 'contacts', RCUD, P),
  ...grant(UserRole.SALES_DIRECTOR, 'activities', RCUD, P),
  ...grant(UserRole.SALES_DIRECTOR, 'campaigns', RCUD, P),
  ...grant(UserRole.SALES_DIRECTOR, 'opportunities', RCUD, P),
  ...grant(UserRole.SALES_DIRECTOR, 'quotes', PERMISSION_CATALOGUE.quotes, P),
  ...grant(UserRole.SALES_DIRECTOR, 'contracts', RU, P),
  ...grant(UserRole.SALES_DIRECTOR, 'invoices', RU, P),
  ...grant(UserRole.SALES_DIRECTOR, 'deployments', RU, P),
  ...grant(UserRole.SALES_DIRECTOR, 'trainings', RU, P),
  ...grant(UserRole.SALES_DIRECTOR, 'tickets', RU, P),
  ...grant(UserRole.SALES_DIRECTOR, 'dashboard', R, P),
  ...grant(UserRole.SALES_DIRECTOR, 'stats', ['read', 'export'], P),
  ...grant(UserRole.SALES_DIRECTOR, 'pricing', R, P),
  ...grant(UserRole.SALES_DIRECTOR, 'settings', R, P),
  ...grant(UserRole.SALES_DIRECTOR, 'references', R, P),
  ...grant(UserRole.SALES_DIRECTOR, 'scopes', R, P),
  ...grant(UserRole.SALES_DIRECTOR, 'roles', R, P),
  ...grant(UserRole.SALES_DIRECTOR, 'users', R, P),
  ...grant(UserRole.SALES_DIRECTOR, 'auditLog', R, P),
  ...grant(UserRole.SALES_DIRECTOR, 'data', ['purge'], P),

  // ---------- SALES_REP : own amounts only (OWN), signs but does not validate ----------
  ...grant(UserRole.SALES_REP, 'organizations', RCU, P),
  ...grant(UserRole.SALES_REP, 'organizations', ['bulk'], O),
  ...grant(UserRole.SALES_REP, 'contacts', RCU, P),
  ...grant(UserRole.SALES_REP, 'activities', RCU, O),
  ...grant(UserRole.SALES_REP, 'campaigns', RCU, P),
  ...grant(UserRole.SALES_REP, 'opportunities', RCU, O),
  ...grant(UserRole.SALES_REP, 'quotes', ['read', 'create', 'update', 'submit', 'sign'], O),
  ...grant(UserRole.SALES_REP, 'contracts', R, O),
  ...grant(UserRole.SALES_REP, 'deployments', R, P),
  ...grant(UserRole.SALES_REP, 'trainings', R, P),
  ...grant(UserRole.SALES_REP, 'tickets', R, P),
  ...grant(UserRole.SALES_REP, 'dashboard', R, O),
  ...grant(UserRole.SALES_REP, 'stats', R, O),
  ...grant(UserRole.SALES_REP, 'pricing', R, P),
  ...grant(UserRole.SALES_REP, 'references', R, P),

  // ---------- DEPLOYMENT_CONSULTANT : after-sales in write, sales in read, no prospecting ----------
  ...grant(UserRole.DEPLOYMENT_CONSULTANT, 'organizations', RU, P),
  ...grant(UserRole.DEPLOYMENT_CONSULTANT, 'contacts', RCU, P),
  ...grant(UserRole.DEPLOYMENT_CONSULTANT, 'activities', RCU, P),
  ...grant(UserRole.DEPLOYMENT_CONSULTANT, 'quotes', R, P),
  ...grant(UserRole.DEPLOYMENT_CONSULTANT, 'contracts', R, P),
  ...grant(UserRole.DEPLOYMENT_CONSULTANT, 'deployments', RU, P),
  ...grant(UserRole.DEPLOYMENT_CONSULTANT, 'trainings', RCU, P),
  ...grant(UserRole.DEPLOYMENT_CONSULTANT, 'tickets', RCUD, P),
  ...grant(UserRole.DEPLOYMENT_CONSULTANT, 'references', R, P),

  // ---------- TRAINER : own sessions, customer sheet in read ----------
  ...grant(UserRole.TRAINER, 'organizations', R, P),
  ...grant(UserRole.TRAINER, 'contacts', R, P),
  ...grant(UserRole.TRAINER, 'deployments', R, P),
  ...grant(UserRole.TRAINER, 'trainings', RU, P),
  ...grant(UserRole.TRAINER, 'references', R, P),

  // ---------- BILLING_ADMIN : contracts, invoices, Chorus, all amounts, no prospecting ----------
  ...grant(UserRole.BILLING_ADMIN, 'organizations', R, P),
  ...grant(UserRole.BILLING_ADMIN, 'contacts', R, P),
  ...grant(UserRole.BILLING_ADMIN, 'quotes', R, P),
  ...grant(UserRole.BILLING_ADMIN, 'contracts', RU, P),
  ...grant(UserRole.BILLING_ADMIN, 'invoices', PERMISSION_CATALOGUE.invoices, P),
  ...grant(UserRole.BILLING_ADMIN, 'dashboard', R, P),
  ...grant(UserRole.BILLING_ADMIN, 'stats', R, P),
  ...grant(UserRole.BILLING_ADMIN, 'references', R, P),

  // ---------- OBSERVER : read-only on a scope ----------
  ...grant(UserRole.OBSERVER, 'organizations', R, P),
  ...grant(UserRole.OBSERVER, 'contacts', R, P),
  ...grant(UserRole.OBSERVER, 'activities', R, P),
  ...grant(UserRole.OBSERVER, 'campaigns', R, P),
  ...grant(UserRole.OBSERVER, 'opportunities', R, P),
  ...grant(UserRole.OBSERVER, 'deployments', R, P),
  ...grant(UserRole.OBSERVER, 'trainings', R, P),
  ...grant(UserRole.OBSERVER, 'tickets', R, P),
  ...grant(UserRole.OBSERVER, 'references', R, P),

  // ---------- SUPER_ADMIN : everything, scope ALL ----------
  ...permissionsData.map((p) => ({ role: UserRole.SUPER_ADMIN, permission: p.code, scope: ScopeType.ALL })),
];

const SEED_ERRORS = {
  unknownRole: (role: string) => `Unknown role in mapping: ${role}`,
  unknownPermission: (permission: string) => `Unknown permission in mapping: ${permission}`,
};

export async function seedAuth(prisma: PrismaClient): Promise<void> {
  console.log(`Seeding ${permissionsData.length} permissions and ${rolesData.length} system roles...`);

  // Permissions: catalogue replaced wholesale (role_permissions cascade, then rebuilt below).
  // Overrides referencing a removed permission are dropped by the cascade — intended.
  await prisma.permission.deleteMany({});
  await prisma.permission.createMany({ data: permissionsData, skipDuplicates: true });

  // System roles: upsert by code with project_id IS NULL (partial unique index).
  const existingRoles = await prisma.role.findMany({ where: { projectId: null } });
  const existingByCode = new Map(existingRoles.map((r) => [r.code, r.id]));
  const savedRoles = await Promise.all(
    rolesData.map((role) => {
      const existingId = existingByCode.get(role.code);
      const data = {
        label: role.label,
        isBackoffice: role.isBackoffice,
        outOfScopeAccess: role.outOfScopeAccess,
        isSystem: true,
      };
      return existingId
        ? prisma.role.update({ where: { id: existingId }, data })
        : prisma.role.create({ data: { ...role, ...data, projectId: null } });
    }),
  );
  const roleIds = new Map(savedRoles.map((r) => [r.code, r.id]));

  // Matrix: rebuilt for system roles only (project-duplicated roles are never touched).
  const permissions = await prisma.permission.findMany({ select: { id: true, code: true } });
  const permissionIds = new Map(permissions.map((p) => [p.code, p.id]));

  await prisma.rolePermission.deleteMany({ where: { roleId: { in: [...roleIds.values()] } } });

  const rows = rolePermMapping.map((g) => {
    const roleId = roleIds.get(g.role);
    const permissionId = permissionIds.get(g.permission);
    if (!roleId) throw new Error(SEED_ERRORS.unknownRole(g.role));
    if (!permissionId) throw new Error(SEED_ERRORS.unknownPermission(g.permission));
    return { roleId, permissionId, scope: g.scope };
  });
  await prisma.rolePermission.createMany({ data: rows, skipDuplicates: true });

  console.log(`Role matrix: ${rows.length} grants`);
}
