import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { File, FileCategory, FileOwnerType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { assertAndHashPassword } from '@/auth/utils/password.utils';
import { apiError } from '@/common/api-error';
import { FileService } from '@/files/file.service';
import { PrismaService } from '@/prisma/prisma.service';
import { StorageService } from '@/storage/storage.service';
import { AvatarResponseDto } from './dto/avatar-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { MeResponseDto } from './dto/me-response.dto';
import { ProfileCoreResponseDto, UpdateProfileDto, UploadedFileLike } from './dto/update-profile.dto';
import { PROFILE_AUDIT } from './profile.constants';
import { mapToMeResponse, userWithAccess } from './profile.utils';

const PROFILE_CORE_SELECT = { id: true, email: true, firstName: true, lastName: true, phone: true } as const;

/** US-00-03 — account-level profile (no x-project-id). */
@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly fileService: FileService,
    private readonly audit: AuditLogService,
    private readonly config: ConfigService,
  ) {}

  /** Single profile read (SPEC-06 §6): identity, avatar, relations, legal state. */
  async getMe(userId: string): Promise<MeResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, ...userWithAccess });
    if (!user) throw apiError.notFound('USER_NOT_FOUND');
    return mapToMeResponse(user, await this.resolveAvatarUrl(userId));
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<ProfileCoreResponseDto> {
    if (Object.keys(dto).length === 0) throw apiError.badRequest('EMPTY_UPDATE_PAYLOAD');
    return this.prisma.user.update({ where: { id: userId }, data: dto, select: PROFILE_CORE_SELECT });
  }

  /** Verifies the current password, sets the new one and closes every OTHER session. */
  async changePassword(userId: string, sessionId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw apiError.notFound('USER_NOT_FOUND');

    if (!(await bcrypt.compare(dto.oldPassword, user.password))) {
      throw apiError.badRequest('OLD_PASSWORD_MISMATCH');
    }
    if (await bcrypt.compare(dto.newPassword, user.password)) {
      throw apiError.badRequest('PASSWORD_MUST_BE_DIFFERENT_FROM_OLD');
    }

    const password = await assertAndHashPassword(this.config, dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { password, passwordChangedAt: new Date() } });
      await tx.session.deleteMany({ where: { userId, id: { not: sessionId } } });
      await this.audit.log(tx, {
        projectId: null,
        userId,
        action: PROFILE_AUDIT.PASSWORD_CHANGE,
        objectType: AUDIT_OBJECTS.USER,
        objectId: userId,
      });
    });
  }

  /** Replaces the avatar (single per user, FileService AVATAR rules) and returns its URL. */
  async updateAvatar(userId: string, file: UploadedFileLike | undefined): Promise<AvatarResponseDto> {
    if (!file || file.buffer.byteLength === 0) throw apiError.badRequest('STORAGE_FILE_REQUIRED');

    const saved = await this.fileService.upload({
      projectId: null,
      ownerType: FileOwnerType.USER,
      ownerId: userId,
      category: FileCategory.AVATAR,
      buffer: file.buffer,
      fileName: file.originalname,
      declaredMimeType: file.mimetype,
      uploadedBy: userId,
    });

    // Guarded presign: a transient storage hiccup must not 500 a committed upload
    return { avatarUrl: (await this.presignAvatar(userId, saved)) ?? '' };
  }

  async deleteAvatar(userId: string, user: AuthenticatedUser): Promise<void> {
    const avatar = await this.findAvatarFile(userId);
    if (!avatar) throw apiError.notFound('USER_AVATAR_NOT_SET');
    await this.fileService.delete(avatar.id, user);
  }

  // ----------------------------------------------------------------------------------------

  private findAvatarFile(userId: string): Promise<File | null> {
    return this.prisma.file.findFirst({
      where: { projectId: null, ownerType: FileOwnerType.USER, ownerId: userId, category: FileCategory.AVATAR },
    });
  }

  /** Presigned URL of the avatar; null when absent or when storage is unreachable. */
  private async resolveAvatarUrl(userId: string): Promise<string | null> {
    const avatar = await this.findAvatarFile(userId);
    return avatar ? this.presignAvatar(userId, avatar) : null;
  }

  private async presignAvatar(userId: string, file: File): Promise<string | null> {
    try {
      const { publicUrl } = await this.storage.getObject(null, userId, file.filePath, file.fileName);
      return publicUrl;
    } catch (e) {
      this.logger.warn(`Avatar URL resolution failed for ${userId}: ${(e as Error).message}`);
      return null;
    }
  }
}
