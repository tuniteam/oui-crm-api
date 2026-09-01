import { FileCategory, FileOwnerType } from '@prisma/client';
import { MIME } from '@/common/constants/mime.constants';

const MB = 1024 * 1024;

/**
 * Maximum upload size by category, in bytes.
 */
export const MAX_SIZE_BY_CATEGORY: Record<FileCategory, number> = {
  AVATAR: 2 * MB,
  HTML_TEMPLATE: 1 * MB,
  SIGNATURE_IMAGE: 2 * MB,
  QUOTE_PDF: 20 * MB,
  CONTRACT_PDF: 20 * MB,
  SIGNED_RETURN: 20 * MB,
  IMPORT_SOURCE: 10 * MB,
  EXPORT_REPORT: 50 * MB,
};

/**
 * Allowed MIME types per category. Binary types are validated against magic bytes,
 * text types by content sniffing (storage.utils).
 */
export const ALLOWED_MIME_BY_CATEGORY: Record<FileCategory, string[]> = {
  AVATAR: [MIME.JPEG, MIME.PNG],
  HTML_TEMPLATE: [MIME.HTML],
  SIGNATURE_IMAGE: [MIME.JPEG, MIME.PNG],
  QUOTE_PDF: [MIME.PDF],
  CONTRACT_PDF: [MIME.PDF],
  SIGNED_RETURN: [MIME.PDF, MIME.JPEG, MIME.PNG],
  IMPORT_SOURCE: [
    MIME.CSV,
    MIME.XLS,
    MIME.XLSX,
  ],
  EXPORT_REPORT: [
    MIME.CSV,
    MIME.PDF,
    MIME.XLSX,
  ],
};

/**
 * Default extension when the uploaded file name has none and MIME → ext mapping fails.
 */
export const DEFAULT_EXTENSION_BY_CATEGORY: Record<FileCategory, string> = {
  AVATAR: 'jpg',
  HTML_TEMPLATE: 'html',
  SIGNATURE_IMAGE: 'png',
  QUOTE_PDF: 'pdf',
  CONTRACT_PDF: 'pdf',
  SIGNED_RETURN: 'pdf',
  IMPORT_SOURCE: 'xlsx',
  EXPORT_REPORT: 'csv',
};

/**
 * MIME → extension mapping for auto-extension on filenames without extension.
 */
export const MIME_TO_EXT: Record<string, string> = {
  [MIME.PDF]: 'pdf',
  [MIME.JPEG]: 'jpg',
  [MIME.PNG]: 'png',
  [MIME.HTML]: 'html',
  [MIME.CSV]: 'csv',
  [MIME.XLS]: 'xls',
  [MIME.XLSX]: 'xlsx',
};

/**
 * Categories that can never be deleted through the API (contractual evidence).
 */
export const NEVER_DELETABLE: ReadonlySet<FileCategory> = new Set<FileCategory>([
  FileCategory.QUOTE_PDF,
  FileCategory.CONTRACT_PDF,
  FileCategory.SIGNED_RETURN,
]);

/**
 * Categories produced by the server only (never uploaded by a user through the API).
 */
export const SYSTEM_ONLY_CATEGORIES: ReadonlySet<FileCategory> = new Set<FileCategory>([
  FileCategory.QUOTE_PDF,
  FileCategory.CONTRACT_PDF,
  FileCategory.EXPORT_REPORT,
]);

/**
 * Owner types compatible with each category. Used by upload validation.
 */
export const VALID_OWNER_TYPES_BY_CATEGORY: Record<FileCategory, FileOwnerType[]> = {
  AVATAR: [FileOwnerType.USER],
  HTML_TEMPLATE: [FileOwnerType.PROJECT],
  SIGNATURE_IMAGE: [FileOwnerType.PROJECT],
  QUOTE_PDF: [FileOwnerType.QUOTE],
  CONTRACT_PDF: [FileOwnerType.CONTRACT],
  SIGNED_RETURN: [FileOwnerType.QUOTE],
  IMPORT_SOURCE: [FileOwnerType.IMPORT_BATCH],
  EXPORT_REPORT: [FileOwnerType.PROJECT],
};

/**
 * Permission required to read / write (upload or delete) a file of a category within its
 * project. AVATAR is owner-self only and has no permission (see FileService).
 */
export const READ_PERMISSION_BY_CATEGORY: Partial<Record<FileCategory, string>> = {
  HTML_TEMPLATE: 'settings:read',
  SIGNATURE_IMAGE: 'settings:read',
  QUOTE_PDF: 'quotes:read',
  SIGNED_RETURN: 'quotes:read',
  CONTRACT_PDF: 'contracts:read',
  IMPORT_SOURCE: 'organizations:import',
  EXPORT_REPORT: 'stats:export',
};

export const WRITE_PERMISSION_BY_CATEGORY: Partial<Record<FileCategory, string>> = {
  HTML_TEMPLATE: 'settings:update',
  SIGNATURE_IMAGE: 'settings:update',
  SIGNED_RETURN: 'quotes:update',
  IMPORT_SOURCE: 'organizations:import',
};

/** Audit action written by FileService.delete (uploads are audited by their feature). */
export const FILES_AUDIT = {
  DELETE: 'file.delete',
} as const;
