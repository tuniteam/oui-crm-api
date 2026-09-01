import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { IsCuid } from '@/common/decorators';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { DAY_PATTERN } from '@/common/utils/date.utils';
import { AUDIT_ACTION_MAX_LENGTH, AUDIT_OBJECT_TYPES, AuditObjectType } from '../audit-log.constants';

/** Every filter is optional and cumulative; the list is always newest first. */
export class AuditLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-08-01', description: 'First day (YYYY-MM-DD, UTC, inclusive)' })
  @IsOptional()
  @Matches(DAY_PATTERN)
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31', description: 'Last day (YYYY-MM-DD, UTC, inclusive)' })
  @IsOptional()
  @Matches(DAY_PATTERN)
  to?: string;

  @ApiPropertyOptional({ example: 'cmth…', description: 'Actor' })
  @IsOptional()
  @IsCuid()
  userId?: string;

  @ApiPropertyOptional({ example: 'user.suspend', description: 'Exact action code (object.verb)' })
  @IsOptional()
  @IsString()
  @MaxLength(AUDIT_ACTION_MAX_LENGTH)
  action?: string;

  @ApiPropertyOptional({ enum: AUDIT_OBJECT_TYPES, example: 'User' })
  @IsOptional()
  @IsIn(AUDIT_OBJECT_TYPES)
  objectType?: AuditObjectType;

  @ApiPropertyOptional({ example: 'cmth…', description: 'History of one object' })
  @IsOptional()
  @IsCuid()
  objectId?: string;
}
