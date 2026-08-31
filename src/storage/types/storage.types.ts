import { FileCategory, FileOwnerType } from '@prisma/client';

export type StorageContext =
  | { type: 'ENTITY_FILE'; projectId: string; ownerType: FileOwnerType; ownerId: string; category: FileCategory }
  | { type: 'USER_AVATAR'; userId: string };

export interface StoragePutInput {
  context: StorageContext;
  uploadedBy: string;
  buffer: Buffer;
  originalFileName: string;
  declaredMimeType?: string;
  /**
   * MIME already detected and validated by the caller (FileService category checks):
   * putObject skips its own size/magic-byte validation and trusts this value.
   */
  validatedMimeType?: string;
  /**
   * Max upload size override. Defaults to env MAX_FILE_SIZE_BYTES (5 MB).
   * Higher-level services (e.g. FileService) pass per-category limits here.
   */
  maxSizeBytes?: number;
}

export interface StorageObjectRef {
  bucket: string;
  path: string;
  size: number;
  mimeType: string;
  originalFileName: string;
}

export interface StorageObjectUrlRef {
  publicUrl: string;
  expiresAt: string;
}
