import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsObject, IsString, Matches, MaxLength, Min } from 'class-validator';
import { IsOptionalNotNull } from '@/common/decorators/optional-not-null.decorator';
import { REFERENCE_CATEGORIES, ReferenceCategory } from '@/projects/project-config.constants';
import { REFERENCE_KEY_MAX_LENGTH, REFERENCE_KEY_PATTERN, REFERENCE_LABEL_MAX_LENGTH } from '../reference-items.constants';

export class CreateReferenceItemDto {
  @ApiProperty({ enum: REFERENCE_CATEGORIES, example: 'LEAD_SOURCE' })
  @IsIn(REFERENCE_CATEGORIES)
  category: ReferenceCategory;

  @ApiProperty({ example: 'TRADE_SHOW', description: 'UPPER_SNAKE, immutable, unique per category' })
  @IsString()
  @Matches(REFERENCE_KEY_PATTERN)
  @MaxLength(REFERENCE_KEY_MAX_LENGTH)
  key: string;

  @ApiProperty({ example: 'Salon professionnel' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(REFERENCE_LABEL_MAX_LENGTH)
  label: string;

  @ApiPropertyOptional({ example: 9, description: 'Display order; default = last of the category' })
  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, example: { ics: true, defaultDurationMin: 60 }, description: 'Category-specific attributes (free JSON object)' })
  @IsOptionalNotNull()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ReferenceItemIdResponseDto {
  @ApiProperty({ example: 'cmth…' })
  id: string;

  @ApiProperty({ example: 'TRADE_SHOW' })
  key: string;
}
