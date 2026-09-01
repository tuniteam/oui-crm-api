/** Multipart file as delivered by the FileInterceptor (memory storage). */
export interface UploadedFileLike {
  buffer: Buffer;
  originalname: string;
  mimetype?: string;
}
