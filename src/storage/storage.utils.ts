import { createId } from '@paralleldrive/cuid2';
import { fileTypeFromBuffer } from 'file-type';
import { apiError } from '@/common/api-error';
import { MIME } from '@/common/constants/mime.constants';
import { formatMegabytes } from '@/common/utils/math.utils';
import { OBJECT_KEY_PREFIX } from './storage.constants';
import { StorageContext } from './types/storage.types';

/**
 * Binary MIME types validated by magic bytes (file-type).
 */
const BINARY_MIME_TYPES = [MIME.PDF, MIME.JPEG, MIME.PNG, MIME.XLS, MIME.XLSX] as const;

/**
 * Text MIME types: file-type cannot detect them from magic bytes, so they are
 * validated by content sniffing (UTF-8 decodable + shape check).
 */
const TEXT_MIME_TYPES = [MIME.HTML, MIME.CSV] as const;

const ALLOWED_MIME_TYPES = [...BINARY_MIME_TYPES, ...TEXT_MIME_TYPES] as const;
type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Bytes inspected when sniffing a text file. */
const TEXT_SNIFF_BYTES = 64 * 1024;

const BYTE_TAB = 0x09;
const BYTE_LF = 0x0a;
const BYTE_CR = 0x0d;
const BYTE_SPACE = 0x20;

export function assertFileSize(buffer: Buffer, maxFileSizeBytes: number): void {
  if (buffer.byteLength > maxFileSizeBytes) {
    throw apiError.badRequest('STORAGE_FILE_TOO_LARGE', formatMegabytes(maxFileSizeBytes));
  }
}

/**
 * An object key is readable only under the caller's project prefix or its own avatar prefix.
 */
export function assertStorageAccessScope(
  projectId: string | null,
  userId: string,
  objectKey: string,
): void {
  const hasProjectScope =
    !!projectId && objectKey.startsWith(`${OBJECT_KEY_PREFIX.projects}/${projectId}/`);
  const hasUserAvatarScope = objectKey.startsWith(`${OBJECT_KEY_PREFIX.userAvatars}/${userId}/`);

  if (!hasProjectScope && !hasUserAvatarScope) {
    throw apiError.forbidden('STORAGE_ACCESS_DENIED');
  }
}

/**
 * True when the buffer contains a binary control byte (anything below 0x20 except tab, LF, CR).
 */
function hasBinaryControlBytes(buffer: Buffer): boolean {
  for (const byte of buffer) {
    if (byte < BYTE_SPACE && byte !== BYTE_TAB && byte !== BYTE_LF && byte !== BYTE_CR) {
      return true;
    }
  }
  return false;
}

/**
 * Text sniffing for MIME types file-type cannot detect.
 * - text/html: must decode as UTF-8 and contain an HTML root or doctype.
 * - text/csv: must decode as UTF-8 and contain no binary control bytes.
 */
function sniffTextMime(buffer: Buffer, declaredMimeType: string): AllowedMimeType | null {
  const head = buffer.subarray(0, TEXT_SNIFF_BYTES);
  if (hasBinaryControlBytes(head)) return null;

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(head);
  } catch {
    return null;
  }

  if (declaredMimeType === MIME.HTML) {
    return /<!doctype\s+html|<html[\s>]/i.test(text) ? MIME.HTML : null;
  }
  if (declaredMimeType === MIME.CSV) {
    return MIME.CSV;
  }
  return null;
}

export async function detectAndValidateMimeType(
  buffer: Buffer,
  declaredMimeType?: string,
): Promise<AllowedMimeType> {
  if (declaredMimeType && (TEXT_MIME_TYPES as readonly string[]).includes(declaredMimeType)) {
    const sniffed = sniffTextMime(buffer, declaredMimeType);
    if (!sniffed) throw apiError.badRequest('STORAGE_INVALID_MAGIC_BYTES');
    return sniffed;
  }

  const detected = await fileTypeFromBuffer(buffer);
  const detectedMime = detected?.mime;

  if (!detectedMime || !(BINARY_MIME_TYPES as readonly string[]).includes(detectedMime)) {
    throw apiError.badRequest('STORAGE_INVALID_MAGIC_BYTES');
  }

  if (declaredMimeType && declaredMimeType !== detectedMime) {
    throw apiError.badRequest('STORAGE_INVALID_MAGIC_BYTES');
  }

  return detectedMime as AllowedMimeType;
}

export async function validateFileBuffer(
  buffer: Buffer,
  maxFileSizeBytes: number,
  declaredMimeType?: string,
): Promise<AllowedMimeType> {
  assertFileSize(buffer, maxFileSizeBytes);
  return detectAndValidateMimeType(buffer, declaredMimeType);
}

/** Characters allowed in stored/downloaded file names (Content-Disposition safety). */
export const FILE_NAME_PATTERN = /^[\p{L}\p{N}._\-\s()']+$/u;
const FILE_NAME_FORBIDDEN = /[^\p{L}\p{N}._\-\s()']/gu;
const FILE_NAME_MAX_LENGTH = 200;

/**
 * Makes any client-supplied file name storable AND downloadable: forbidden characters are
 * replaced, length capped (extension preserved). getObject validates with the same pattern,
 * so a stored name can always be served as a download.
 */
export function sanitizeFileName(fileName: string): string {
  const cleaned = fileName.replace(FILE_NAME_FORBIDDEN, '_').trim();
  if (!cleaned || cleaned === '.') return 'file';
  if (cleaned.length <= FILE_NAME_MAX_LENGTH) return cleaned;
  const dot = cleaned.lastIndexOf('.');
  const ext = dot > 0 ? cleaned.slice(dot) : '';
  return cleaned.slice(0, FILE_NAME_MAX_LENGTH - ext.length) + ext;
}

export function normalizeFileExtension(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return extension && extension !== fileName.toLowerCase() ? extension : 'bin';
}

/**
 * Object keys are project-scoped (`projects/{projectId}/...`) or user-scoped for avatars.
 * Pure function: also used by the development seed.
 */
export function buildObjectPath(context: StorageContext, extension: string): string {
  const objectId = createId();
  const cleanExtension = extension.replace(/^\./, '').toLowerCase();

  switch (context.type) {
    case 'ENTITY_FILE':
      return `${OBJECT_KEY_PREFIX.projects}/${context.projectId}/${context.ownerType}/${context.ownerId}/${context.category}/${objectId}.${cleanExtension}`;
    case 'USER_AVATAR':
      return `${OBJECT_KEY_PREFIX.userAvatars}/${context.userId}/${objectId}.${cleanExtension}`;
    default:
      throw apiError.internal('STORAGE_CONTEXT_UNSUPPORTED');
  }
}

export function isMinioNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'NoSuchKey'
  );
}
