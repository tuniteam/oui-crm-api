import { File, FileCategory, FileOwnerType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { apiError } from '@/common/api-error';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { isBackofficeUser } from '@/auth/utils/permissions.util';
import {
  DEFAULT_EXTENSION_BY_CATEGORY,
  MIME_TO_EXT,
  VALID_OWNER_TYPES_BY_CATEGORY,
} from './files.constants';

// ============================================
// Project scoping
// ============================================

/**
 * - USER avatars (projectId = null) are user-scoped: no project check.
 * - Backoffice users bypass project scoping (permission still checked by the caller).
 * - Other users must hold a relation on the file's project.
 */
export function userHasProjectAccess(
  user: AuthenticatedUser,
  fileProjectId: string | null,
): boolean {
  if (fileProjectId === null) return true;
  if (isBackofficeUser(user)) return true;
  return user.relations.some((r) => r.projectId === fileProjectId);
}

// ============================================
// Validation assertions
// ============================================

export function assertOwnerCategoryMatch(ownerType: FileOwnerType, category: FileCategory): void {
  const valid = VALID_OWNER_TYPES_BY_CATEGORY[category];
  if (!valid.includes(ownerType)) {
    throw apiError.badRequest('FILE_OWNER_CATEGORY_MISMATCH');
  }
}

/**
 * projectId is null for USER-owned files (avatars) and required for everything else
 * (SPEC-02 §2.7 nullable rule).
 */
export function assertProjectIdConsistency(
  ownerType: FileOwnerType,
  projectId: string | null,
): void {
  if (ownerType === FileOwnerType.USER) {
    if (projectId !== null) {
      throw apiError.badRequest('FILE_PROJECT_ID_FORBIDDEN');
    }
    return;
  }
  if (!projectId) {
    throw apiError.badRequest('FILE_PROJECT_ID_REQUIRED');
  }
}

export function ownerNotFound() {
  return apiError.notFound('FILE_OWNER_NOT_FOUND');
}

/**
 * Loads a file the caller may address: platform files (projectId null) and files of the
 * caller's projects; backoffice users see every project. Fine-grained rights (category
 * permission, avatar ownership) stay in FileService.canRead / canDelete.
 */
export async function getFileOrThrow(
  prisma: PrismaService,
  fileId: string,
  user: AuthenticatedUser,
): Promise<File> {
  const projectIds = user.relations.map((r) => r.projectId).filter((id): id is string => !!id);
  const file = await prisma.file.findFirst({
    where: {
      id: fileId,
      ...(isBackofficeUser(user) ? {} : { OR: [{ projectId: null }, { projectId: { in: projectIds } }] }),
    },
  });
  if (!file) throw apiError.notFound('FILE_NOT_FOUND', fileId);
  return file;
}

/** File row payload from a storage reference — shared by upload, configuration copy and the seed. */
export function buildFileCreateData(params: {
  projectId: string | null;
  ownerType: FileOwnerType;
  ownerId: string;
  category: FileCategory;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  note?: string | null;
}): Prisma.FileUncheckedCreateInput {
  return { ...params, note: params.note ?? null };
}

type OwnerExistenceChecker = (
  prisma: PrismaService | Prisma.TransactionClient,
  ownerId: string,
  projectId: string | null,
) => Promise<boolean>;

/**
 * Registry of owner existence checks. L0 knows USER and PROJECT; later lots register
 * ORGANIZATION, QUOTE, CONTRACT and IMPORT_BATCH through `registerOwnerChecker` from their
 * own module — FileService must never import business modules.
 */
const ownerCheckers: Partial<Record<FileOwnerType, OwnerExistenceChecker>> = {
  [FileOwnerType.USER]: async (prisma, ownerId) => {
    const u = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
    return !!u;
  },
  [FileOwnerType.PROJECT]: async (prisma, ownerId, projectId) => {
    if (projectId !== ownerId) {
      throw apiError.badRequest('FILE_PROJECT_OWNER_MISMATCH');
    }
    const p = await prisma.project.findUnique({ where: { id: ownerId }, select: { id: true } });
    return !!p;
  },
};

export function registerOwnerChecker(ownerType: FileOwnerType, checker: OwnerExistenceChecker): void {
  ownerCheckers[ownerType] = checker;
}

export async function assertOwnerExists(
  prisma: PrismaService | Prisma.TransactionClient,
  ownerType: FileOwnerType,
  ownerId: string,
  projectId: string | null,
): Promise<void> {
  const checker = ownerCheckers[ownerType];
  if (!checker) {
    throw apiError.badRequest('FILE_OWNER_TYPE_NOT_SUPPORTED', ownerType);
  }
  if (!(await checker(prisma, ownerId, projectId))) throw ownerNotFound();
}

// ============================================
// File name helpers
// ============================================

export function ensureFileNameHasExtension(
  fileName: string,
  category: FileCategory,
  detectedMime: string,
): string {
  if (fileName.includes('.')) return fileName;
  const ext = MIME_TO_EXT[detectedMime] ?? DEFAULT_EXTENSION_BY_CATEGORY[category];
  return `${fileName}.${ext}`;
}
