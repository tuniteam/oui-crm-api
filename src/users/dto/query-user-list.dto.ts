import { SEARCH_MAX_LENGTH } from '@/common/constants/app.constants';
import { ROLE_CODE_MAX_LENGTH } from '@/roles/roles.constants';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { ProjectUserStatus } from '../users.constants';

export class UserListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search in e-mail, first name, last name and initials' })
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  search?: string;

  @ApiPropertyOptional({ example: 'SALES_REP', description: 'Filter by role code' })
  @IsOptional()
  @IsString()
  @MaxLength(ROLE_CODE_MAX_LENGTH)
  roleCode?: string;

  @ApiPropertyOptional({ enum: ProjectUserStatus, description: 'Account status, or SUSPENDED (assignment)' })
  @IsOptional()
  @IsEnum(ProjectUserStatus)
  status?: ProjectUserStatus;
}
