import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { IsCuid } from '@/common/decorators/is-cuid.decorator';
import { TerritoryItemStatus, TerritorySkipReason } from '../import.constants';

/** dryRun is explicit on every import call: the simulation is a first-class step, not a default. */
export class ImportRunQueryDto {
  @ApiProperty({ enum: ['true', 'false'], description: 'true = simulation only, nothing is written' })
  @IsIn(['true', 'false'])
  dryRun: 'true' | 'false';
}

export class TerritoryImportDto {
  @ApiPropertyOptional({ type: [String], example: ['89'], description: 'Départements whose communes are imported' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  departments?: string[];

  @ApiPropertyOptional({ type: [String], example: ['248900532'], description: 'EPCI SIREN codes — their communes are imported, never the EPCI itself' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @Matches(/^\d{9}$/, { each: true })
  epciCodes?: string[];

  @ApiPropertyOptional({ example: 500, description: 'Communes below are left out of the request' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minPopulation?: number;

  @ApiPropertyOptional({ example: 10000, description: 'Communes above are left out of the request' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxPopulation?: number;

  @ApiPropertyOptional({ example: false, description: 'Refresh the population of communes already in the base (annual census) — the only field an import may overwrite' })
  @IsOptional()
  @IsBoolean()
  updatePopulation?: boolean;

  @ApiPropertyOptional({ example: 'cmth…', description: 'Sales rep assigned to every created record (active member)' })
  @IsOptional()
  @IsCuid()
  salesRepId?: string;

  @ApiPropertyOptional({ example: 'cmtj…', description: 'Created records are targeted by this campaign (they start TO_CONTACT)' })
  @IsOptional()
  @IsCuid()
  campaignId?: string;
}

export class TerritoryTotalsDto {
  @ApiProperty({ example: 410 })
  created: number;

  @ApiProperty({ example: 0, description: 'Populations refreshed (updatePopulation: true)' })
  updated: number;

  @ApiProperty({ example: 13, description: 'Communes already in the base — never overwritten' })
  skipped: number;

  @ApiProperty({ example: 0 })
  errors: number;
}

export class TerritoryItemDto {
  @ApiProperty({ example: '89024' })
  inseeCode: string;

  @ApiProperty({ example: 'Auxerre' })
  name: string;

  @ApiPropertyOptional({ example: 34634, nullable: true })
  population: number | null;

  @ApiProperty({ enum: ['CREATED', 'UPDATED', 'SKIPPED'], example: 'CREATED' })
  status: TerritoryItemStatus;

  @ApiPropertyOptional({ enum: ['ALREADY_EXISTS'], description: 'Why the commune was skipped' })
  reason?: TerritorySkipReason;
}

export class TerritoryReportDto {
  @ApiProperty({ example: true })
  dryRun: boolean;

  @ApiProperty({ example: true, description: 'False when the report carries errors' })
  ok: boolean;

  @ApiPropertyOptional({ example: 'cmtk…', nullable: true, description: 'Present after a real run — cancellable while nothing was modified' })
  batchId?: string;

  @ApiProperty({ type: TerritoryTotalsDto })
  totals: TerritoryTotalsDto;

  @ApiProperty({ type: [TerritoryItemDto], description: 'One row per commune of the request' })
  items: TerritoryItemDto[];
}
