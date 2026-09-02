import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SalesStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SALES_STATUS_REASON_MAX_LENGTH } from '../organizations.constants';

export class ChangeSalesStatusDto {
  @ApiProperty({ enum: SalesStatus, example: SalesStatus.IN_PROGRESS })
  @IsEnum(SalesStatus)
  salesStatus: SalesStatus;

  @ApiPropertyOptional({ example: 'Relance après le salon des maires.', description: 'Kept in the audit journal' })
  @IsOptional()
  @IsString()
  @MaxLength(SALES_STATUS_REASON_MAX_LENGTH)
  reason?: string;
}

export class ChangeSalesStatusResponseDto {
  @ApiProperty({ example: 'cmtj…' })
  id: string;

  @ApiProperty({ enum: SalesStatus })
  salesStatus: SalesStatus;
}
