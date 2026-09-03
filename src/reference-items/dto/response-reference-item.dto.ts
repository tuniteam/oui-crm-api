import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '@/common/dto/pagination.dto';
import { REFERENCE_CATEGORIES } from '@/projects/project-config.constants';

export class ReferenceItemResponseDto {
  @ApiProperty({ example: 'cmth…' })
  id: string;

  @ApiProperty({ enum: REFERENCE_CATEGORIES, example: 'LEAD_SOURCE' })
  category: string;

  @ApiProperty({ example: 'WEB_FORM' })
  key: string;

  @ApiProperty({ example: 'Formulaire site web' })
  label: string;

  @ApiProperty({ example: 1 })
  order: number;

  @ApiProperty({ example: true })
  active: boolean;

  @ApiProperty({ type: 'object', additionalProperties: true, example: {} })
  metadata: Record<string, unknown>;

  @ApiProperty({ example: 0, description: 'Business objects using the value (0 for every category at L0)' })
  usageCount: number;
}

export class ReferenceItemsListResponseDto {
  @ApiProperty({ type: [ReferenceItemResponseDto], description: 'Sorted by category, order, label' })
  data: ReferenceItemResponseDto[];

  @ApiProperty({
    type: PaginationMetaDto,
    description: 'Present even unpaged: total then equals the number of returned rows',
  })
  meta: PaginationMetaDto;
}
