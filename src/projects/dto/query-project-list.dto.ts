import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { PROJECT_NAME_MAX_LENGTH } from '../projects.constants';

export class ProjectListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ProjectStatus, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @ApiPropertyOptional({ description: 'Search in slug, name and product name' })
  @IsOptional()
  @IsString()
  @MaxLength(PROJECT_NAME_MAX_LENGTH)
  search?: string;
}
