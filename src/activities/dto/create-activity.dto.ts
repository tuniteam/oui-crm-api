import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { IsCuid } from '@/common/decorators/is-cuid.decorator';
import { DAY_PATTERN } from '@/common/utils/date.utils';
import {
  ACTIVITY_TYPE_MAX_LENGTH,
  LOCATION_MAX_LENGTH,
  MAX_DURATION_MIN,
  REPORT_MAX_LENGTH,
  TIME_PATTERN,
} from '../activities.constants';

export class CreateActivityDto {
  @ApiProperty({ example: 'cmtj…' })
  @IsCuid()
  organizationId: string;

  @ApiPropertyOptional({ example: 'cmtj…', description: 'Interlocutor of the activity (contact of the same record)' })
  @IsOptional()
  @IsCuid()
  contactId?: string;

  @ApiProperty({ example: 'MEETING', description: 'ACTIVITY_TYPE reference key' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(ACTIVITY_TYPE_MAX_LENGTH)
  type: string;

  @ApiProperty({ example: '2026-09-15', description: 'YYYY-MM-DD' })
  @Matches(DAY_PATTERN)
  date: string;

  @ApiPropertyOptional({ example: '14:30', description: 'Local wall-clock HH:MM' })
  @IsOptional()
  @Matches(TIME_PATTERN)
  time?: string;

  @ApiPropertyOptional({ example: 90 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_DURATION_MIN)
  durationMin?: number;

  @ApiPropertyOptional({ example: 'Mairie de Caen, salle 2' })
  @IsOptional()
  @IsString()
  @MaxLength(LOCATION_MAX_LENGTH)
  location?: string;

  @ApiPropertyOptional({ example: 'Préparer la démo cantine.', description: 'Notes before completion' })
  @IsOptional()
  @IsString()
  @MaxLength(REPORT_MAX_LENGTH)
  report?: string;

  @ApiPropertyOptional({ example: 'cmtj…', description: 'Campaign the activity belongs to (US-01-11)' })
  @IsOptional()
  @IsCuid()
  campaignId?: string;
}
