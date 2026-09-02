import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ACTIVITY_TYPE_MAX_LENGTH, REPORT_MAX_LENGTH } from '../activities.constants';

export class CompleteActivityDto {
  @ApiProperty({ example: 'DGS convaincue, démo cantine à planifier.', description: 'The report is what makes the activity real' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(REPORT_MAX_LENGTH)
  report: string;

  @ApiPropertyOptional({ example: 'MEETING_BOOKED', description: 'ACTIVITY_RESULT reference key' })
  @IsOptional()
  @IsString()
  @MaxLength(ACTIVITY_TYPE_MAX_LENGTH)
  result?: string;

  @ApiPropertyOptional({ example: '2026-09-15T15:30:00.000Z', description: 'Defaults to now' })
  @IsOptional()
  @IsISO8601()
  completedAt?: string;
}
