import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PAGINATION_MAX_LIMIT } from '@/common/dto/pagination.dto';
import { REFERENCE_CATEGORIES, ReferenceCategory } from '@/projects/project-config.constants';

/**
 * Pagination is OPTIONAL here, unlike every other list of the API: the front loads the whole
 * catalogue to fill its pickers and filters, and paging it by default would break that.
 * Without `page`, the route answers everything as before — no client breaks. With `page`, it
 * pages, which bounds a catalogue that has no structural ceiling (203 values on 02/09, twice
 * the morning figure after an import).
 */
export class QueryReferenceItemsDto {
  @ApiPropertyOptional({ enum: REFERENCE_CATEGORIES, description: 'Omit to load every category of the project at once' })
  @IsOptional()
  @IsIn(REFERENCE_CATEGORIES)
  category?: ReferenceCategory;

  @ApiPropertyOptional({ minimum: 1, description: 'Omit for the full catalogue (default behaviour)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: PAGINATION_MAX_LIMIT,
    description: 'Only used together with page',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION_MAX_LIMIT)
  limit?: number;
}
