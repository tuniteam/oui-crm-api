import { Response } from 'express';

/**
 * Streams a generated file to the client as a download.
 *
 * Centralizes the `Content-Type` + `Content-Disposition` + `res.send` block
 * shared by every export endpoint (Couche A of the export framework).
 * The filename is sanitized to keep the `Content-Disposition` header valid.
 */
export function sendFileAttachment(
  res: Response,
  file: { buffer: Buffer; filename: string; contentType: string },
): void {
  const safeName = file.filename.replace(/[\r\n"]/g, '_');
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.send(file.buffer);
}
