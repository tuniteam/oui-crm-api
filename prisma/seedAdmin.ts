import { PrismaClient, RelationshipStatus, UserStatus } from '@prisma/client';
import { UserRole } from '../src/auth/enums/user-role.enum';

export interface PlatformSuperAdmin {
  email: string;
  firstName: string;
  lastName: string;
  initials: string;
  passwordHash: string;
}

/**
 * Le super-administrateur de la plateforme : un compte actif et sa relation backoffice, sans
 * projet. Écrit une fois pour deux appelants :
 * - la démo (`seedDev`), qui remet le mot de passe à chaque passage ;
 * - le premier administrateur d'une base de production (`runSeed`, variables `ADMIN_*`), qui ne
 *   touche **jamais** à un compte existant — un redémarrage ne doit pas réécrire un mot de passe
 *   que son titulaire a changé (SPEC-20).
 */
export async function ensurePlatformSuperAdmin(
  prisma: PrismaClient,
  admin: PlatformSuperAdmin,
  options: { resetPassword: boolean },
): Promise<{ id: string }> {
  const role = await prisma.role.findFirst({ where: { projectId: null, code: UserRole.SUPER_ADMIN } });
  if (!role) throw new Error(`System role ${UserRole.SUPER_ADMIN} missing — run seedAuth first`);

  const user = await prisma.user.upsert({
    where: { email: admin.email },
    update: options.resetPassword ? { password: admin.passwordHash } : {},
    create: {
      email: admin.email,
      password: admin.passwordHash,
      firstName: admin.firstName,
      lastName: admin.lastName,
      status: UserStatus.ACTIVE,
    },
  });

  const relation = await prisma.userRoleProject.findFirst({ where: { userId: user.id, projectId: null } });
  if (!relation) {
    await prisma.userRoleProject.create({
      data: {
        userId: user.id,
        projectId: null,
        roleId: role.id,
        initials: admin.initials,
        status: RelationshipStatus.ACTIVE,
        displayOrder: 1,
      },
    });
  }
  return { id: user.id };
}
