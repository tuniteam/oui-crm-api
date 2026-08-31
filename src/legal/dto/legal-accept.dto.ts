import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { LegalDocument } from '@/common/legal/legal.constants';

/** true = the user re-accepts the document; versions are stamped server-side. */
export class LegalAcceptDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  cgu?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  rgpd?: boolean;
}

export class LegalAcceptResponseDto {
  @ApiProperty({ enum: LegalDocument, isArray: true, example: [LegalDocument.CGU] })
  accepted: LegalDocument[];

  @ApiProperty({ example: false, description: 'true while at least one document is still outdated' })
  legalReacceptanceRequired: boolean;
}
