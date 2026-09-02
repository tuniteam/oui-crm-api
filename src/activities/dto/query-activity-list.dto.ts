import { ApiPropertyOptional } from '@nestjs/swagger';
import { ActivityStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { IsCuid } from '@/common/decorators/is-cuid.decorator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { DAY_PATTERN } from '@/common/utils/date.utils';
import { ACTIVITY_TYPE_MAX_LENGTH } from '../activities.constants';

export class ActivityListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'cmtj…', description: 'The Actions tab of a record' })
  @IsOptional()
  @IsCuid()
  organizationId?: string;

  @ApiPropertyOptional({ example: 'cmth…', description: 'Ignored for an OWN-scoped caller (always their own)' })
  @IsOptional()
  @IsCuid()
  userId?: string;

  @ApiPropertyOptional({ enum: ActivityStatus, description: '"Late / today" dashboards use status=PLANNED&to=today' })
  @IsOptional()
  @IsEnum(ActivityStatus)
  status?: ActivityStatus;

  @ApiPropertyOptional({ example: 'CALL' })
  @IsOptional()
  @IsString()
  @MaxLength(ACTIVITY_TYPE_MAX_LENGTH)
  type?: string;

  @ApiPropertyOptional({ example: '2026-09-01', description: 'First day, inclusive' })
  @IsOptional()
  @Matches(DAY_PATTERN)
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Last day, inclusive' })
  @IsOptional()
  @Matches(DAY_PATTERN)
  to?: string;
}
