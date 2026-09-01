import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsObject, IsString, MaxLength, Min } from 'class-validator';
import { IsOptionalNotNull } from '@/common/decorators/optional-not-null.decorator';
import { REFERENCE_LABEL_MAX_LENGTH } from '../reference-items.constants';

/** `category` and `key` are immutable; a used value is deactivated, never deleted. */
export class UpdateReferenceItemDto {
  @ApiPropertyOptional({ example: 'Salon professionnel' })
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(REFERENCE_LABEL_MAX_LENGTH)
  label?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ example: false, description: 'false hides the value from pickers; existing records keep it' })
  @IsOptionalNotNull()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, description: 'Replaced as a whole when present' })
  @IsOptionalNotNull()
  @IsObject()
  metadata?: Record<string, unknown>;
}
