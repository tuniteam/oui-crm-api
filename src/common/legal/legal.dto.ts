import { ApiProperty } from '@nestjs/swagger';
import { LegalDocument } from './legal.constants';
import { LegalDocumentInfo } from './legal.utils';

/** A legal document to display/accept — shared by activation/validate and /profile/me. */
export class LegalDocumentDto implements LegalDocumentInfo {
  @ApiProperty({ enum: LegalDocument, example: LegalDocument.CGU })
  code: LegalDocument;

  @ApiProperty({ example: 1 })
  version: number;

  @ApiProperty({ example: 'https://oui-crm.example/cgu' })
  url: string;
}
