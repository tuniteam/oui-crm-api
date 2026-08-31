import { ApiProperty } from '@nestjs/swagger';

export class FileDownloadResponseDto {
  @ApiProperty({ description: 'Presigned URL to download the file directly from MinIO' })
  url: string;

  @ApiProperty({ description: 'ISO timestamp when the presigned URL expires' })
  expiresAt: string;
}
