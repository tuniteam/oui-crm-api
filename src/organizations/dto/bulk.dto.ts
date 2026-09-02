import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Priority, SalesStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { IsCuid } from '@/common/decorators/is-cuid.decorator';
import { BULK_ACTIONS, BULK_BATCH_MAX, BulkAction, BulkSkipReason } from '../organizations.constants';
import { OrganizationListQueryDto } from './query-organization-list.dto';

/** The list filters, replayed server-side for a "select all" (no paging or sorting). */
export class BulkFiltersDto extends OmitType(OrganizationListQueryDto, ['page', 'limit', 'sort', 'order'] as const) {}

export class BulkPayloadDto {
  @ApiPropertyOptional({ example: 'cmth…', description: 'ASSIGN_SALES_REP — an active member of the project' })
  @IsOptional()
  @IsCuid()
  salesRepId?: string;

  @ApiPropertyOptional({ enum: SalesStatus, description: 'SET_SALES_STATUS' })
  @IsOptional()
  @IsEnum(SalesStatus)
  salesStatus?: SalesStatus;

  @ApiPropertyOptional({ enum: Priority, description: 'SET_PRIORITY' })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({ example: 'cmtj…', description: 'ADD_TO_CAMPAIGN — a campaign of the project' })
  @IsOptional()
  @IsCuid()
  campaignId?: string;
}

export class BulkActionDto {
  @ApiPropertyOptional({ type: [String], example: ['cmtj…'], description: `Explicit selection (${BULK_BATCH_MAX} max); ignored when selectAll is true` })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(BULK_BATCH_MAX)
  @ArrayUnique()
  @IsCuid({ each: true })
  ids?: string[];

  @ApiPropertyOptional({ example: false, description: 'Replays the list filters server-side instead of ids' })
  @IsOptional()
  @IsBoolean()
  selectAll?: boolean;

  @ApiPropertyOptional({ type: BulkFiltersDto, description: 'The filters of the current list, when selectAll is true' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => BulkFiltersDto)
  filters?: BulkFiltersDto;

  @ApiProperty({ enum: BULK_ACTIONS, example: 'SET_PRIORITY' })
  @IsEnum(BULK_ACTIONS)
  action: BulkAction;

  @ApiProperty({ type: BulkPayloadDto, description: 'Exactly the field the action needs' })
  @IsObject()
  @ValidateNested()
  @Type(() => BulkPayloadDto)
  payload: BulkPayloadDto;
}

export class BulkSkippedDto {
  @ApiProperty({ example: 'cmtj…' })
  id: string;

  @ApiProperty({ enum: ['NOT_FOUND', 'OUT_OF_SCOPE'], example: 'OUT_OF_SCOPE' })
  reason: BulkSkipReason;
}

export class BulkResultDto {
  @ApiProperty({ example: 12, description: 'Records the action was applied to (idempotent cases included)' })
  processed: number;

  @ApiProperty({ type: [BulkSkippedDto], description: 'Never a global failure on a partial selection' })
  skipped: BulkSkippedDto[];
}
