import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Priority, SalesStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PAGINATION_DEFAULT_PAGE, PAGINATION_MAX_LIMIT, PaginationMetaDto } from '@/common/dto/pagination.dto';
import { BOARD_DEFAULT_LIMIT } from '../organizations.constants';
import { UserRefDto } from './response-organization.dto';

/**
 * Le tableau se pagine **par colonne** : sans `salesStatus`, les cinq colonnes rendent leur
 * page courante ; avec, une seule colonne répond — c'est ainsi qu'on déroule une colonne sans
 * recharger les quatre autres.
 */
export class BoardQueryDto {
  @ApiPropertyOptional({ enum: SalesStatus, description: 'Narrow the answer to one column' })
  @IsOptional()
  @IsEnum(SalesStatus)
  salesStatus?: SalesStatus;

  @ApiPropertyOptional({ default: PAGINATION_DEFAULT_PAGE, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = PAGINATION_DEFAULT_PAGE;

  @ApiPropertyOptional({ default: BOARD_DEFAULT_LIMIT, minimum: 1, maximum: PAGINATION_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION_MAX_LIMIT)
  limit: number = BOARD_DEFAULT_LIMIT;
}

/**
 * A kanban card. Outside the caller's scope with a RESTRICTED role the card is greyed:
 * only id, name, salesRep and access are present — the front disables its drag.
 */
export class BoardItemDto {
  @ApiProperty({ example: 'cmtj…', description: 'restricted' })
  id: string;

  @ApiProperty({ example: 'Commune de Joigny', description: 'restricted' })
  name: string;

  @ApiPropertyOptional({ type: UserRefDto, nullable: true, description: 'restricted' })
  salesRep: UserRefDto | null;

  @ApiProperty({ enum: ['FULL', 'RESTRICTED'], example: 'FULL' })
  access: 'FULL' | 'RESTRICTED';

  @ApiPropertyOptional({ enum: Priority })
  priority?: Priority;

  @ApiPropertyOptional({ example: ['HOT'] })
  tags?: string[];

  @ApiPropertyOptional({ example: '2026-09-15T00:00:00.000Z', nullable: true })
  nextActivityAt?: Date | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  lastActivityAt?: Date | null;
}

export class BoardColumnDto {
  @ApiProperty({ enum: SalesStatus, example: SalesStatus.TO_CONTACT })
  salesStatus: SalesStatus;

  @ApiProperty({
    type: PaginationMetaDto,
    description:
      'Pagination OF THAT COLUMN: `total` is its real size, and `page < totalPages` says more cards are waiting. Ask for them with salesStatus + page',
  })
  meta: PaginationMetaDto;

  @ApiProperty({ type: [BoardItemDto], description: 'Next activity first, then name' })
  items: BoardItemDto[];
}

export class BoardResponseDto {
  @ApiProperty({ type: [BoardColumnDto], description: 'Always the 5 columns, in pipeline order' })
  columns: BoardColumnDto[];
}
