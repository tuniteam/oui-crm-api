import { SEARCH_MAX_LENGTH } from '@/common/constants/app.constants';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { ProjectUserStatus } from '@/users/users.constants';

export class BackofficeUserListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search in e-mail, first name and last name' })
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  search?: string;

  @ApiPropertyOptional({ enum: ProjectUserStatus, description: 'Account status, or SUSPENDED (backoffice access suspended)' })
  @IsOptional()
  @IsEnum(ProjectUserStatus)
  status?: ProjectUserStatus;
}
