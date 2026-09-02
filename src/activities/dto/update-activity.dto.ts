import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { IsCuid } from '@/common/decorators/is-cuid.decorator';
import { IsOptionalNotNull } from '@/common/decorators/optional-not-null.decorator';
import { DAY_PATTERN } from '@/common/utils/date.utils';
import {
  ACTIVITY_TYPE_MAX_LENGTH,
  LOCATION_MAX_LENGTH,
  MAX_DURATION_MIN,
  REPORT_MAX_LENGTH,
  TIME_PATTERN,
} from '../activities.constants';

/** Rescheduling a PLANNED activity; a completed or cancelled one is history and never changes. */
export class UpdateActivityDto {
  @ApiPropertyOptional({ example: 'cmtj…', nullable: true, description: 'null detaches the contact' })
  @IsOptional()
  @IsCuid()
  contactId?: string | null;

  @ApiPropertyOptional({ example: 'DEMO' })
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(ACTIVITY_TYPE_MAX_LENGTH)
  type?: string;

  @ApiPropertyOptional({ example: '2026-09-16' })
  @IsOptionalNotNull()
  @Matches(DAY_PATTERN)
  date?: string;

  @ApiPropertyOptional({ example: '10:00', nullable: true })
  @IsOptional()
  @Matches(TIME_PATTERN)
  time?: string | null;

  @ApiPropertyOptional({ example: 60, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_DURATION_MIN)
  durationMin?: number | null;

  @ApiPropertyOptional({ example: 'Visio', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(LOCATION_MAX_LENGTH)
  location?: string | null;

  @ApiPropertyOptional({ example: 'Reporté à la demande de la DGS.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(REPORT_MAX_LENGTH)
  report?: string | null;

  @ApiPropertyOptional({ example: 'cmtj…', nullable: true, description: 'null detaches the campaign' })
  @IsOptional()
  @IsCuid()
  campaignId?: string | null;
}
