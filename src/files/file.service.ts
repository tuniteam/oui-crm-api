import { Injectable, Logger } from '@nestjs/common';
import { File, FileCategory, FileOwnerType, Prisma } from '@prisma/client';
import { apiError } from '@/common/api-error';
import { PRISMA_ERROR } from '@/common/constants/app.constants';
import { formatMegabytes } from '@/common/utils/math.utils';
import { PrismaService } from '@/prisma/prisma.service';
import { StorageService } from '@/storage/storage.service';
import { assertFileSize, detectAndValidateMimeType, isMinioNotFoundError } from '@/storage/storage.utils';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { userHasPermission } from '@/auth/utils/permissions.util';
import {
  ALLOWED_MIME_BY_CATEGORY,
  MAX_SIZE_BY_CATEGORY,
  NEVER_DELETABLE,
  READ_PERMISSION_BY_CATEGORY,
  SYSTEM_ONLY_CATEGORIES,
  WRITE_PERMISSION_BY_CATEGORY,
} from './files.constants';
import {
  assertOwnerCategoryMatch,
  assertOwnerExists,
  assertProjectIdConsistency,
  buildFileCreateData,
  ensureFileNameHasExtension,
  getFileOrThrow,
  userHasProjectAccess,
} from './files.utils';

export interface UploadFileInput {
  projectId: string | null;
  ownerType: FileOwnerType;
  ownerId: string;
  category: FileCategory;
  buffer: Buffer;
  fileName: string;
  declaredMimeType?: string;
  uploadedBy: string;
  note?: string;
}

/**
 * Categories whose previous file is replaced on upload (one active file per owner).
 */
const SINGLE_PER_OWNER: ReadonlySet<FileCategory> = new Set<FileCategory>([
  FileCategory.AVATAR,
  FileCategory.SIGNATURE_IMAGE,
]);

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  // ============================================
  // upload
  // ============================================
  async upload(input: UploadFileInput): Promise<File> {
    assertOwnerCategoryMatch(input.ownerType, input.category);
    assertProjectIdConsistency(input.ownerType, input.projectId);
    await assertOwnerExists(this.prisma, input.ownerType, input.ownerId, input.projectId);

    // Category limits, checked once, before any MinIO write; putObject trusts the result.
    const maxSize = MAX_SIZE_BY_CATEGORY[input.category];
    if (input.buffer.byteLength > maxSize) {
      throw apiError.badRequest('STORAGE_FILE_TOO_LARGE', formatMegabytes(maxSize));
    }
    assertFileSize(input.buffer, maxSize);
    const detectedMime = await detectAndValidateMimeType(input.buffer, input.declaredMimeType);
    if (!ALLOWED_MIME_BY_CATEGORY[input.category].includes(detectedMime)) {
      throw apiError.badRequest('STORAGE_INVALID_MIME_TYPE');
    }

    // Object key: users-avatar/{userId}/... or projects/{projectId}/{ownerType}/{ownerId}/{category}/...
    const context =
      input.ownerType === FileOwnerType.USER
        ? { type: 'USER_AVATAR' as const, userId: input.ownerId }
        : {
            type: 'ENTITY_FILE' as const,
            projectId: input.projectId!,
            ownerType: input.ownerType,
            ownerId: input.ownerId,
            category: input.category,
          };

    const ref = await this.storageService.putObject({
      context,
      uploadedBy: input.uploadedBy,
      buffer: input.buffer,
      originalFileName: input.fileName,
      validatedMimeType: detectedMime,
    });

    const finalFileName = ensureFileNameHasExtension(input.fileName, input.category, ref.mimeType);

    // Single-per-owner categories: snapshot the previous file BEFORE inserting so the
    // replacement is atomic and a concurrently uploaded file is never deleted by mistake.
    const previous = SINGLE_PER_OWNER.has(input.category)
      ? await this.prisma.file.findFirst({
          where: {
            projectId: input.projectId,
            ownerType: input.ownerType,
            ownerId: input.ownerId,
            category: input.category,
          },
          select: { id: true, filePath: true, projectId: true },
        })
      : null;

    let file: File;
    try {
      const ops: Prisma.PrismaPromise<unknown>[] = [
        this.prisma.file.create({
          data: buildFileCreateData({
            projectId: input.projectId,
            ownerType: input.ownerType,
            ownerId: input.ownerId,
            category: input.category,
            fileName: finalFileName,
            filePath: ref.path,
            fileSize: ref.size,
            mimeType: ref.mimeType,
            uploadedBy: input.uploadedBy,
            note: input.note,
          }),
        }),
      ];
      if (previous) {
        ops.push(this.prisma.file.delete({ where: { id: previous.id } }));
      }
      const results = await this.prisma.$transaction(ops);
      file = results[0] as File;
    } catch (error) {
      // Compensate: remove the MinIO object if the DB transaction failed
      this.logger.error(`File DB insert failed, compensating MinIO delete: ${(error as Error).message}`);
      await this.storageService
        .deleteObject(input.projectId, input.uploadedBy, ref.path)
        .catch(() => undefined);
      throw apiError.internal('STORAGE_UPLOAD_FAILED');
    }

    // Best-effort cleanup of the replaced object (DB row already deleted in the transaction)
    if (previous) {
      await this.storageService
        .deleteObject(previous.projectId, input.uploadedBy, previous.filePath)
        .catch(() => undefined);
    }

    return file;
  }

  // ============================================
  // read
  // ============================================
  async getById(fileId: string, user: AuthenticatedUser): Promise<File> {
    const file = await getFileOrThrow(this.prisma, fileId, user);
    if (!this.canRead(file, user)) throw apiError.forbidden('STORAGE_ACCESS_DENIED');
    return file;
  }

  async getDownloadUrl(fileId: string, user: AuthenticatedUser): Promise<{ url: string; expiresAt: string }> {
    const file = await this.getById(fileId, user);
    const { publicUrl, expiresAt } = await this.storageService.getObject(
      file.projectId,
      user.id,
      file.filePath,
      file.fileName,
    );
    return { url: publicUrl, expiresAt };
  }

  /**
   * Server-side read of a file's content (template rendering, signature image injection).
   * No user authorization: the calling service is responsible for scoping by project.
   */
  async getBuffer(file: File): Promise<Buffer> {
    return this.storageService.getObjectBuffer(file.filePath);
  }

  // ============================================
  // delete (hard-delete)
  // ============================================
  async delete(fileId: string, user: AuthenticatedUser): Promise<void> {
    const file = await getFileOrThrow(this.prisma, fileId, user);

    if (NEVER_DELETABLE.has(file.category)) throw apiError.forbidden('FILE_RETENTION_LOCKED');
    if (!this.canDelete(file, user)) throw apiError.forbidden('STORAGE_ACCESS_DENIED');

    // MinIO first (tolerating an already-missing object), then DB — idempotent overall.
    await this.storageService.deleteObject(file.projectId, user.id, file.filePath).catch((err) => {
      if (!isMinioNotFoundError(err)) throw err;
    });

    try {
      await this.prisma.file.delete({ where: { id: file.id } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === PRISMA_ERROR.RECORD_NOT_FOUND
      ) {
        return; // already deleted by a concurrent request
      }
      throw err;
    }
  }

  // ============================================
  // Authorization — canRead / canWrite / canDelete
  // ============================================

  /**
   * AVATAR: the owner only. Other categories: a member of the project holding the
   * category's read permission (SPEC-06 catalogue). Backoffice users hold ALL-scoped
   * permissions and pass through userHasPermission.
   */
  canRead(file: File, user: AuthenticatedUser): boolean {
    if (!userHasProjectAccess(user, file.projectId)) return false;

    if (file.category === FileCategory.AVATAR) {
      return file.ownerType === FileOwnerType.USER && file.ownerId === user.id;
    }

    const permission = READ_PERMISSION_BY_CATEGORY[file.category];
    return !!permission && userHasPermission(user, file.projectId, permission);
  }

  canWrite(
    user: AuthenticatedUser,
    projectId: string | null,
    ownerType: FileOwnerType,
    ownerId: string,
    category: FileCategory,
  ): boolean {
    if (SYSTEM_ONLY_CATEGORIES.has(category)) return false;

    if (category === FileCategory.AVATAR) {
      return ownerType === FileOwnerType.USER && ownerId === user.id;
    }

    if (!userHasProjectAccess(user, projectId)) return false;

    const permission = WRITE_PERMISSION_BY_CATEGORY[category];
    return !!permission && userHasPermission(user, projectId, permission);
  }

  canDelete(file: File, user: AuthenticatedUser): boolean {
    if (NEVER_DELETABLE.has(file.category)) return false;
    return this.canWrite(user, file.projectId, file.ownerType, file.ownerId, file.category);
  }
}
