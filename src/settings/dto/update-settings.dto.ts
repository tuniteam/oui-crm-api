import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNumber,
  IsObject,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsOptionalNotNull } from '@/common/decorators/optional-not-null.decorator';
import {
  AMOUNT_DECIMALS,
  COMPANY_FIELD_MAX_LENGTH,
  PERCENT_MAX,
  SIREN_PATTERN,
  SIRET_PATTERN,
} from '../settings.constants';

/** Present fields are merged into the stored identity; an empty string clears a field. */
export class CompanyDto {
  @ApiPropertyOptional({ example: 'PERISCOLIA SAS' })
  @IsOptionalNotNull()
  @IsString()
  @MaxLength(COMPANY_FIELD_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional({ example: '102 985 173', description: '9 digits, optional spaces' })
  @IsOptionalNotNull()
  @IsString()
  @ValidateIf((o: CompanyDto) => o.siren !== '')
  @Matches(SIREN_PATTERN)
  siren?: string;

  @ApiPropertyOptional({ example: '10298517300016', description: '14 digits, optional spaces' })
  @IsOptionalNotNull()
  @IsString()
  @ValidateIf((o: CompanyDto) => o.siret !== '')
  @Matches(SIRET_PATTERN)
  siret?: string;

  @ApiPropertyOptional({ example: 'RCS Nanterre 102 985 173' })
  @IsOptionalNotNull()
  @IsString()
  @MaxLength(COMPANY_FIELD_MAX_LENGTH)
  rcs?: string;

  @ApiPropertyOptional({ example: '120 rue Jean-Jaurès, 92300 Levallois-Perret' })
  @IsOptionalNotNull()
  @IsString()
  @MaxLength(COMPANY_FIELD_MAX_LENGTH)
  address?: string;

  @ApiPropertyOptional({ example: '01 89 62 96 56' })
  @IsOptionalNotNull()
  @IsString()
  @MaxLength(COMPANY_FIELD_MAX_LENGTH)
  phone?: string;

  @ApiPropertyOptional({ example: 'contact@periscolia.fr' })
  @IsOptionalNotNull()
  @IsString()
  @ValidateIf((o: CompanyDto) => o.email !== '')
  @IsEmail()
  @MaxLength(COMPANY_FIELD_MAX_LENGTH)
  email?: string;

  @ApiPropertyOptional({ example: 'B.ABID', description: 'Contract signatory' })
  @IsOptionalNotNull()
  @IsString()
  @MaxLength(COMPANY_FIELD_MAX_LENGTH)
  signatory?: string;
}

/** Partial update; `company` and `stageProbabilities` are merged key by key. */
export class UpdateSettingsDto {
  @ApiPropertyOptional({ example: 20, description: 'VAT rate in %, 2 decimals max' })
  @IsOptionalNotNull()
  @IsNumber({ maxDecimalPlaces: AMOUNT_DECIMALS })
  @Min(0)
  @Max(PERCENT_MAX)
  vatRate?: number;

  @ApiPropertyOptional({ example: 130000, description: 'Yearly revenue target, excl. VAT' })
  @IsOptionalNotNull()
  @IsNumber({ maxDecimalPlaces: AMOUNT_DECIMALS })
  @Min(0)
  revenueTarget?: number;

  @ApiPropertyOptional({ example: 20, description: 'Monthly meetings target' })
  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  meetingTarget?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptionalNotNull()
  @IsInt()
  @Min(1)
  quoteValidityDays?: number;

  @ApiPropertyOptional({ example: 2, description: 'Termination notice, in months' })
  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  noticeMonths?: number;

  @ApiPropertyOptional({ example: 36 })
  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  defaultCommitmentMonths?: number;

  @ApiPropertyOptional({ example: 30, description: 'Discount % above which a quote needs validation' })
  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  @Max(PERCENT_MAX)
  discountCap?: number;

  @ApiPropertyOptional({ example: 36, description: 'Prospect data retention, in months' })
  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  retentionMonths?: number;

  @ApiPropertyOptional({ type: CompanyDto })
  @IsOptionalNotNull()
  @IsObject()
  @ValidateNested()
  @Type(() => CompanyDto)
  company?: CompanyDto;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'integer' },
    example: { QUOTE_SENT: 25, NEGOTIATING: 60 },
    description: 'Integer 0–100 per stage; WON (100) and LOST (0) cannot change',
  })
  @IsOptionalNotNull()
  @IsObject()
  stageProbabilities?: Record<string, unknown>;
}
