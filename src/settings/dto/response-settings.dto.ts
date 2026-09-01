import { ApiProperty } from '@nestjs/swagger';

export class CompanyResponseDto {
  @ApiProperty({ example: 'PERISCOLIA SAS' })
  name: string;

  @ApiProperty({ example: '102 985 173' })
  siren: string;

  @ApiProperty({ example: '10298517300016' })
  siret: string;

  @ApiProperty({ example: 'RCS Nanterre 102 985 173' })
  rcs: string;

  @ApiProperty({ example: '120 rue Jean-Jaurès, 92300 Levallois-Perret' })
  address: string;

  @ApiProperty({ example: '01 89 62 96 56' })
  phone: string;

  @ApiProperty({ example: 'contact@periscolia.fr' })
  email: string;

  @ApiProperty({ example: 'B.ABID' })
  signatory: string;
}

export class SettingsResponseDto {
  @ApiProperty({ example: 20 })
  vatRate: number;

  @ApiProperty({ example: 130000 })
  revenueTarget: number;

  @ApiProperty({ example: 20 })
  meetingTarget: number;

  @ApiProperty({ example: 30 })
  quoteValidityDays: number;

  @ApiProperty({ example: 2 })
  noticeMonths: number;

  @ApiProperty({ example: 36 })
  defaultCommitmentMonths: number;

  @ApiProperty({ example: 30 })
  discountCap: number;

  @ApiProperty({ example: 36 })
  retentionMonths: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'integer' },
    example: { QUALIFICATION: 10, DEMONSTRATION: 30, QUOTE_SENT: 25, NEGOTIATING: 60, VERBAL_AGREEMENT: 80, WON: 100, LOST: 0 },
    description: 'Always the 7 stages',
  })
  stageProbabilities: Record<string, number>;

  @ApiProperty({ type: CompanyResponseDto, description: 'Always the 8 fields; empty string = not set' })
  company: CompanyResponseDto;

  @ApiProperty({ example: '2026-09-01T10:00:00.000Z' })
  updatedAt: Date;
}
