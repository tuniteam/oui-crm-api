import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { Readable } from 'stream';
import { apiError } from '@/common/api-error';
import { getBoolean, getNumber } from '@/common/utils/config.utils';
import { MS_PER_SECOND } from '@/common/utils/date.utils';
import {
  DEFAULT_MAX_FILE_SIZE_BYTES,
  DEFAULT_PRESIGNED_GET_TTL_SECONDS,
  SSE_ALGORITHM,
  SSE_HEADER,
  STORAGE_ENV,
} from './storage.constants';
import {
  assertStorageAccessScope,
  buildObjectPath,
  FILE_NAME_PATTERN,
  isMinioNotFoundError,
  normalizeFileExtension,
  validateFileBuffer,
} from './storage.utils';
import { StorageContext, StorageObjectRef, StorageObjectUrlRef, StoragePutInput } from './types/storage.types';

export const MINIO_CLIENT = 'MINIO_CLIENT';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly bucket: string;
  private readonly useSse: boolean;
  private readonly presignedGetExpirySeconds: number;
  private readonly maxFileSizeBytes: number;
  private readonly logger = new Logger(StorageService.name);

  constructor(
    @Inject(MINIO_CLIENT) private readonly minioClient: Minio.Client,
    private readonly configService: ConfigService,
  ) {
    this.bucket = this.configService.getOrThrow<string>(STORAGE_ENV.MINIO_BUCKET);
    // Server-side encryption is applied at upload time via MinIO object metadata.
    this.useSse = getBoolean(this.configService, STORAGE_ENV.MINIO_USE_SSE);
    this.presignedGetExpirySeconds = getNumber(
      this.configService,
      STORAGE_ENV.MINIO_PRESIGNED_GET_TTL,
      DEFAULT_PRESIGNED_GET_TTL_SECONDS,
    );
    this.maxFileSizeBytes = getNumber(
      this.configService,
      STORAGE_ENV.MAX_FILE_SIZE_BYTES,
      DEFAULT_MAX_FILE_SIZE_BYTES,
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      const exists = await this.bucketExists();
      if (exists) {
        this.logger.log(`✅ Storage bucket ready: ${this.bucket}`);
      } else {
        this.logger.warn(`⚠️ Storage bucket missing: ${this.bucket}`);
      }
    } catch (error: unknown) {
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`❌ Storage bucket check failed: ${this.bucket}`, stack);
    }
  }

  async putObject(input: StoragePutInput): Promise<StorageObjectRef> {
    const { context, buffer, originalFileName, declaredMimeType, maxSizeBytes, validatedMimeType } = input;

    // Validate file size and MIME using content "magic bytes" (not only client-declared headers),
    // unless the caller already ran the validation (FileService category checks).
    const detectedMime =
      validatedMimeType ??
      (await validateFileBuffer(buffer, maxSizeBytes ?? this.maxFileSizeBytes, declaredMimeType));

    const path = buildObjectPath(context, normalizeFileExtension(originalFileName));
    await this.writeObject(path, buffer, detectedMime);

    return { bucket: this.bucket, path, size: buffer.byteLength, mimeType: detectedMime, originalFileName };
  }

  /**
   * Read an object into memory (server-side use only: template rendering, exports).
   * Access control is the caller's responsibility — this method never leaves the server.
   */
  async getObjectBuffer(objectKey: string): Promise<Buffer> {
    try {
      const stream = await this.minioClient.getObject(this.bucket, objectKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (error: unknown) {
      throw this.normalizeNotFound(error, objectKey);
    }
  }

  async getObject(
    projectId: string | null,
    userId: string,
    objectKey: string,
    downloadFileName?: string,
  ): Promise<StorageObjectUrlRef> {
    // Enforce storage authorization for both project-scoped objects and user avatars.
    assertStorageAccessScope(projectId, userId, objectKey);

    // Validate download filename if provided (defense against HTTP header injection).
    // Uploads sanitize names with the same pattern (sanitizeFileName), so stored names pass.
    if (downloadFileName && !FILE_NAME_PATTERN.test(downloadFileName)) {
      throw apiError.badRequest('FILENAME_INVALID_CHARS');
    }

    try {
      // Short-lived presigned URL so the client downloads directly from MinIO.
      const reqParams = downloadFileName
        ? { 'response-content-disposition': `attachment; filename="${downloadFileName}"` }
        : undefined;
      const url = await this.minioClient.presignedGetObject(
        this.bucket,
        objectKey,
        this.presignedGetExpirySeconds,
        reqParams,
      );
      // Replace internal MinIO host with the public host
      const urlObj = new URL(url);
      const publicBase = new URL(this.configService.getOrThrow<string>(STORAGE_ENV.PRESIGNED_PUBLIC_URL));
      urlObj.protocol = publicBase.protocol;
      urlObj.host = publicBase.host;
      const expiresAt = new Date(Date.now() + this.presignedGetExpirySeconds * MS_PER_SECOND).toISOString();
      return { publicUrl: urlObj.toString(), expiresAt };
    } catch (error: unknown) {
      throw this.normalizeNotFound(error, objectKey);
    }
  }

  /**
   * Server-side copy of an existing object into a new context (project configuration copy).
   * No validation: the source was validated when it was uploaded.
   */
  async copyObject(sourceKey: string, context: StorageContext, originalFileName: string): Promise<string> {
    const path = buildObjectPath(context, normalizeFileExtension(originalFileName));
    try {
      await this.minioClient.copyObject(this.bucket, path, `/${this.bucket}/${sourceKey}`);
    } catch (error: unknown) {
      if (isMinioNotFoundError(error)) throw this.normalizeNotFound(error, sourceKey);
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('MinIO copy failed: ' + message);
      throw apiError.internal('STORAGE_UPLOAD_FAILED');
    }
    return path;
  }

  async deleteObject(projectId: string | null, userId: string, objectKey: string): Promise<void> {
    // Enforce storage authorization before deletion.
    assertStorageAccessScope(projectId, userId, objectKey);
    try {
      await this.minioClient.removeObject(this.bucket, objectKey);
    } catch (error: unknown) {
      throw this.normalizeNotFound(error, objectKey);
    }
  }

  async bucketExists(): Promise<boolean> {
    return this.minioClient.bucketExists(this.bucket);
  }

  // ----------------------------------------------------------------------------------------

  private async writeObject(path: string, buffer: Buffer, mimeType: string): Promise<void> {
    const metadata: Record<string, string> = { 'Content-Type': mimeType };
    if (this.useSse) metadata[SSE_HEADER] = SSE_ALGORITHM;
    try {
      await this.minioClient.putObject(this.bucket, path, Readable.from(buffer), buffer.byteLength, metadata);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error('MinIO upload failed: ' + message, stack);
      throw apiError.internal('STORAGE_UPLOAD_FAILED');
    }
  }

  /** MinIO NoSuchKey → 404 STORAGE_OBJECT_NOT_FOUND; anything else is rethrown. */
  private normalizeNotFound(error: unknown, objectKey: string): unknown {
    return isMinioNotFoundError(error) ? apiError.notFound('STORAGE_OBJECT_NOT_FOUND', objectKey) : error;
  }
}
