import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerStatus, Priority, SalesStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { IsCuid } from '@/common/decorators';
import { DAY_PATTERN } from '@/common/utils/date.utils';

/** SIRET: 14 digits. SIREN: 9. Both optional — the territory import never provides them. */
const SIRET_PATTERN = /^\d{14}$/;
const INSEE_PATTERN = /^[0-9AB]\d{4}$/i;
const DEPARTMENT_PATTERN = /^(?:\d{2}|2[AB]|9[7-8]\d)$/i;

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Commune de Joigny' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'COMMUNE', description: 'Key of the STRUCTURE_TYPE reference list' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  type: string;

  @ApiProperty({ example: '89', description: 'Two-digit code, 2A/2B for Corsica, three digits overseas' })
  @IsString()
  @Matches(DEPARTMENT_PATTERN)
  department: string;

  @ApiPropertyOptional({ example: 'Commune de ', description: 'Defaults to the reference list metadata' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  displayPrefix?: string;

  @ApiPropertyOptional({ example: '10298517300016' })
  @IsOptional()
  @Matches(SIRET_PATTERN)
  siret?: string;

  @ApiPropertyOptional({ example: '102985173' })
  @IsOptional()
  @Matches(/^\d{9}$/)
  siren?: string;

  @ApiPropertyOptional({ example: '89206', description: 'INSEE code — rapprochement key of the territory import' })
  @IsOptional()
  @Matches(INSEE_PATTERN)
  inseeCode?: string;

  @ApiPropertyOptional({ example: '1 quai du 1er Dragons' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ example: '89300' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  postalCode?: string;

  @ApiPropertyOptional({ example: 'Joigny' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ example: 9820, description: 'Drives the pricing bracket; without it no quote can be issued' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  population?: number;

  @ApiPropertyOptional({ example: 'CC du Jovinien' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  epci?: string;

  @ApiPropertyOptional({ example: '03 86 92 48 00' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'contact@joigny.fr' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: 'https://www.joigny.fr' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @ApiPropertyOptional({ example: 'BL_ENFANCE', description: 'Key of the SOLUTION reference list' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  solution?: string;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  schoolCount?: number;

  @ApiPropertyOptional({ example: 320 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  childCount?: number;

  @ApiPropertyOptional({ example: ['CANTEEN', 'MORNING_CARE'], description: 'Keys of the SERVICE reference list' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  services?: string[];

  @ApiPropertyOptional({ enum: SalesStatus, default: SalesStatus.NOT_CONTACTED })
  @IsOptional()
  @IsEnum(SalesStatus)
  salesStatus?: SalesStatus;

  @ApiPropertyOptional({ enum: CustomerStatus, default: CustomerStatus.NOT_CUSTOMER })
  @IsOptional()
  @IsEnum(CustomerStatus)
  customerStatus?: CustomerStatus;

  @ApiPropertyOptional({ enum: Priority, default: Priority.NORMAL })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({ example: ['HOT'], description: 'Keys of the TAG reference list' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: 'OUTBOUND', description: 'Key of the LEAD_SOURCE reference list' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  leadSource?: string;

  @ApiPropertyOptional({ example: 'PREMIUM' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  targetPlan?: string;

  @ApiPropertyOptional({ example: 'cjld2cjxh0000qzrmn831i7rn' })
  @IsOptional()
  @IsCuid()
  salesRepId?: string;

  @ApiPropertyOptional({ example: 'cjld2cjxh0000qzrmn831i7rn' })
  @IsOptional()
  @IsCuid()
  consultantId?: string;

  @ApiPropertyOptional({ example: 'cjld2cjxh0000qzrmn831i7rn' })
  @IsOptional()
  @IsCuid()
  trainerId?: string;

  @ApiPropertyOptional({ example: 'Contact pris au salon des maires' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: '2026-09-01', description: 'Target go-live date (YYYY-MM-DD)' })
  @IsOptional()
  @Matches(DAY_PATTERN)
  goLiveTarget?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Confirms the creation despite a same-name record at the same postal code',
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class CreateOrganizationResponseDto {
  @ApiProperty({ example: 'cjld2cjxh0000qzrmn831i7rn' })
  id: string;

  @ApiProperty({ example: 'Commune de Joigny' })
  name: string;

  @ApiProperty({ example: 83, description: 'Percentage of the six completeness criteria that are filled' })
  completenessScore: number;
}
