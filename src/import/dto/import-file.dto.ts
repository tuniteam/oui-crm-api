import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ImportProfile } from '@prisma/client';
import { Allow, IsIn } from 'class-validator';
import { FILE_PROFILES } from '../import-file.constants';

/** Profile + explicit dryRun — both are first-class, never defaulted. */
export class ImportFileQueryDto {
  @ApiProperty({ enum: FILE_PROFILES, example: ImportProfile.GENERIC })
  @IsIn(FILE_PROFILES as readonly string[])
  profile: ImportProfile;

  @ApiProperty({ enum: ['true', 'false'], description: 'true = simulation only, nothing is written' })
  @IsIn(['true', 'false'])
  dryRun: 'true' | 'false';
}

export class ImportTemplateQueryDto {
  @ApiProperty({ enum: FILE_PROFILES, example: ImportProfile.GENERIC })
  @IsIn(FILE_PROFILES as readonly string[])
  profile: ImportProfile;
}

export class ImportRowMessageDto {
  @ApiProperty({ example: 'Organizations' })
  @Allow()
  sheet: string;

  @ApiProperty({ example: 7, description: 'Excel row number — what a business user sees in the file' })
  @Allow()
  row: number;

  @ApiPropertyOptional({ example: 'department' })
  @Allow()
  field?: string;

  @ApiProperty({ example: 'UNKNOWN_DEPARTMENT' })
  @Allow()
  code: string;

  @ApiProperty({ example: 'Department 100 is not a known French department' })
  @Allow()
  message: string;
}

export class ImportResourceTotalsDto {
  @ApiProperty({ example: 'organizations' })
  @Allow()
  resource: string;

  @ApiProperty({ example: 42 })
  @Allow()
  created: number;

  @ApiProperty({ example: 3, description: 'Existing records whose empty fields were filled' })
  @Allow()
  updated: number;

  @ApiProperty({ example: 5, description: 'Rows matching an existing record left untouched' })
  @Allow()
  skipped: number;
}

export class ImportTotalsDto {
  @ApiProperty({ example: 42 })
  @Allow()
  created: number;

  @ApiProperty({ example: 3 })
  @Allow()
  updated: number;

  @ApiProperty({ example: 5 })
  @Allow()
  skipped: number;

  @ApiProperty({ example: 1, description: 'Rows rejected — listed one by one in errors[]' })
  @Allow()
  errors: number;

  @ApiProperty({ example: 2 })
  @Allow()
  warnings: number;
}

export class ImportReportDto {
  @ApiProperty({ example: true })
  @Allow()
  dryRun: boolean;

  @ApiProperty({ example: false, description: 'True when no row was rejected' })
  @Allow()
  ok: boolean;

  @ApiPropertyOptional({ example: 'cmtk…', description: 'Present after a real run — cancellable while nothing was modified' })
  @Allow()
  batchId?: string;

  @ApiProperty({ type: ImportTotalsDto })
  @Allow()
  totals: ImportTotalsDto;

  @ApiProperty({ type: [ImportResourceTotalsDto], description: 'Per-resource breakdown' })
  @Allow()
  resources: ImportResourceTotalsDto[];

  @ApiProperty({ type: [ImportRowMessageDto], description: 'Rejected rows, with their Excel row number' })
  @Allow()
  errors: ImportRowMessageDto[];

  @ApiProperty({ type: [ImportRowMessageDto], description: 'Rows imported with a caveat' })
  @Allow()
  warnings: ImportRowMessageDto[];
}
