import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus } from '@prisma/client';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PROJECT_NAME_MAX_LENGTH, PROJECT_TARGET_STATUSES } from '../projects.constants';

export class ChangeProjectStatusDto {
  @ApiProperty({
    enum: PROJECT_TARGET_STATUSES,
    example: ProjectStatus.ACTIVE,
    description: 'Target status. DRAFT → ACTIVE, ACTIVE → ARCHIVED, ARCHIVED → ACTIVE.',
  })
  @IsIn(PROJECT_TARGET_STATUSES)
  status: ProjectStatus;

  @ApiPropertyOptional({
    example: 'Périscolia',
    description: 'Required when archiving: exact name of the project, as confirmation (SPEC-09 T13)',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(PROJECT_NAME_MAX_LENGTH)
  name?: string;
}
