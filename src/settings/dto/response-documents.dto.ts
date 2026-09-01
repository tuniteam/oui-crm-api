import { ApiProperty } from '@nestjs/swagger';
import { DocumentTemplateType } from '@prisma/client';

export class TemplateItemDto {
  @ApiProperty({ enum: DocumentTemplateType, example: DocumentTemplateType.QUOTE })
  type: DocumentTemplateType;

  @ApiProperty({ example: 2, description: 'Rank of the active file among the uploads of this type' })
  version: number;

  @ApiProperty({ example: 'cmth…', description: 'Download through GET /files/:fileId/download' })
  fileId: string;

  @ApiProperty({ example: 'devis-periscolia.html' })
  fileName: string;

  @ApiProperty({ example: '2026-09-01T10:00:00.000Z' })
  uploadedAt: Date;
}

export class SignatureImageDto {
  @ApiProperty({ example: 'cmth…' })
  fileId: string;

  @ApiProperty({ example: 'cachet-signature-periscolia.png' })
  fileName: string;

  @ApiProperty({ example: '2026-09-01T10:00:00.000Z' })
  uploadedAt: Date;
}

export class NumberingExamplesDto {
  @ApiProperty({ example: 'DEV-2026-244-WB001', description: 'DEV-{year}-{day of year}-{initials}{daily sequence}' })
  quote: string;

  @ApiProperty({ example: 'CTR-2026-244-WB001', description: 'Quote number, DEV → CTR' })
  contract: string;

  @ApiProperty({ example: 'FAC-2026-0001', description: 'FAC-{year}-{yearly sequence}' })
  invoice: string;
}

export class DocumentsResponseDto {
  @ApiProperty({ type: [TemplateItemDto], description: 'Active template per type; a type without upload is absent' })
  templates: TemplateItemDto[];

  @ApiProperty({ type: SignatureImageDto, nullable: true })
  signatureImage: SignatureImageDto | null;

  @ApiProperty({ type: NumberingExamplesDto, description: 'Fixed formats (SPEC-01 §4.3), examples computed for today' })
  numbering: NumberingExamplesDto;
}

export class TemplateUploadResponseDto {
  @ApiProperty({ enum: DocumentTemplateType })
  type: DocumentTemplateType;

  @ApiProperty({ example: 3 })
  version: number;

  @ApiProperty({ example: 'cmth…' })
  fileId: string;
}

export class SignatureUploadResponseDto {
  @ApiProperty({ example: 'cmth…' })
  fileId: string;

  @ApiProperty({ example: 'cachet-signature-periscolia.png' })
  fileName: string;
}
