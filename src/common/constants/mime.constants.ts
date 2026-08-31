/** MIME types handled by the platform (uploads, exports). Single source for every list. */
export const MIME = {
  PDF: 'application/pdf',
  JPEG: 'image/jpeg',
  PNG: 'image/png',
  HTML: 'text/html',
  CSV: 'text/csv',
  XLS: 'application/vnd.ms-excel',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

export type MimeType = (typeof MIME)[keyof typeof MIME];
