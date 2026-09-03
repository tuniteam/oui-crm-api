import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { IsCuid } from '@/common/decorators/is-cuid.decorator';
import { PAGINATION_DEFAULT_PAGE, PAGINATION_MAX_LIMIT } from '@/common/dto/pagination.dto';
import { DAY_PATTERN } from '@/common/utils/date.utils';

/**
 * A calendar month needs its whole content at once to paint its cells, so the default limit
 * is the maximum rather than the usual 20: one request per displayed month stays the nominal
 * case. The response still carries `meta`, so a heavy month can be paged instead of silently
 * truncated.
 */
export const AGENDA_DEFAULT_LIMIT = PAGINATION_MAX_LIMIT;

export class AgendaQueryDto {
  @ApiProperty({ example: '2026-09-01', description: 'First day, inclusive — one request per displayed month' })
  @Matches(DAY_PATTERN)
  from: string;

  @ApiProperty({ example: '2026-09-30', description: 'Last day, inclusive' })
  @Matches(DAY_PATTERN)
  to: string;

  @ApiPropertyOptional({ example: 'cmth…', description: 'Another member\'s agenda — ignored for an OWN-scoped caller' })
  @IsOptional()
  @IsCuid()
  userId?: string;

  @ApiPropertyOptional({
    example: 'ACTIVITY,TRAINING',
    description: 'Comma-separated kinds; only ACTIVITY answers at L1, the contract already accepts the others',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  kinds?: string;

  @ApiPropertyOptional({ default: PAGINATION_DEFAULT_PAGE, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = PAGINATION_DEFAULT_PAGE;

  @ApiPropertyOptional({
    default: AGENDA_DEFAULT_LIMIT,
    minimum: 1,
    maximum: PAGINATION_MAX_LIMIT,
    description: 'Defaults to the maximum: a displayed month is normally fetched in one request',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION_MAX_LIMIT)
  limit: number = AGENDA_DEFAULT_LIMIT;
}
