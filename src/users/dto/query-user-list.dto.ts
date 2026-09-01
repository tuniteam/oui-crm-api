import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { ProjectUserStatus } from '../users.constants';

export class UserListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search in e-mail, first name, last name and initials' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ example: 'SALES_REP', description: 'Filter by role code' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  roleCode?: string;

  @ApiPropertyOptional({ enum: ProjectUserStatus, description: 'Account status, or SUSPENDED (assignment)' })
  @IsOptional()
  @IsEnum(ProjectUserStatus)
  status?: ProjectUserStatus;
}
