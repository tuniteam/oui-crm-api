import { ApiProperty } from '@nestjs/swagger';
import { LegalDocumentDto } from '@/common/legal/legal.dto';

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
