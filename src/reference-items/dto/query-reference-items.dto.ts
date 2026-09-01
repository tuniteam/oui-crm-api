import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { REFERENCE_CATEGORIES, ReferenceCategory } from '@/projects/project-config.constants';

export class QueryReferenceItemsDto {
  @ApiPropertyOptional({ enum: REFERENCE_CATEGORIES, description: 'Omit to load every category of the project at once' })
  @IsOptional()
  @IsIn(REFERENCE_CATEGORIES)
  category?: ReferenceCategory;
}
