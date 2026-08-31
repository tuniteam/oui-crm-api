import { ApiProperty } from '@nestjs/swagger';
import { LegalDocument } from '@/common/legal/legal.constants';

export class LegalDocumentDto {
  @ApiProperty({ enum: LegalDocument, example: LegalDocument.CGU })
  code: LegalDocument;

  @ApiProperty({ example: 1 })
  version: number;

  @ApiProperty({ example: 'https://oui-crm.example/cgu' })
  url: string;
}

/** What the activation page shows before the consent checkboxes (SPEC-07 US-00-02). */
export class ActivationValidateResponseDto {
  @ApiProperty({ example: 'email.ouicrm+wiem@gmail.com' })
  email: string;

  @ApiProperty({ example: 'Wiem' })
  firstName: string;

  @ApiProperty({ example: 'Bousaid' })
  lastName: string;

  @ApiProperty({ type: [LegalDocumentDto] })
  legalDocuments: LegalDocumentDto[];
}
