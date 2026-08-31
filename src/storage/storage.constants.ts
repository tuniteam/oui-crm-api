// ============================================
// OUI-CRM - Storage constants (MinIO)
// ============================================

export const STORAGE_ENV = {
  MINIO_ENDPOINT: 'MINIO_ENDPOINT',
  MINIO_PORT: 'MINIO_PORT',
  MINIO_USE_SSL: 'MINIO_USE_SSL',
  MINIO_USE_SSE: 'MINIO_USE_SSE',
  MINIO_ACCESS_KEY: 'MINIO_ACCESS_KEY',
  MINIO_SECRET_KEY: 'MINIO_SECRET_KEY',
  MINIO_BUCKET: 'MINIO_BUCKET',
  MINIO_PRESIGNED_GET_TTL: 'MINIO_PRESIGNED_GET_TTL',
  MAX_FILE_SIZE_BYTES: 'MAX_FILE_SIZE_BYTES',
} as const;

/** Fallback upload limit when neither the category nor MAX_FILE_SIZE_BYTES bounds it. */
export const DEFAULT_MAX_FILE_SIZE_BYTES = 5_000_000;

/** Presigned GET URL validity when MINIO_PRESIGNED_GET_TTL is not set (seconds). */
export const DEFAULT_PRESIGNED_GET_TTL_SECONDS = 900;

/** SSE-S3 server-managed encryption metadata (MinIO compatible). */
export const SSE_HEADER = 'x-amz-server-side-encryption';
export const SSE_ALGORITHM = 'AES256';

/** Object-key roots — assertStorageAccessScope and buildObjectPath must stay in sync. */
export const OBJECT_KEY_PREFIX = {
  projects: 'projects',
  userAvatars: 'users-avatar',
} as const;
