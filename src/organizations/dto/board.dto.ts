import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Priority, SalesStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  PAGINATION_MAX_LIMIT,
  PaginationMetaDto,
  PaginationQueryDto,
} from '@/common/dto/pagination.dto';
import { BOARD_DEFAULT_LIMIT } from '../organizations.constants';
import { UserRefDto } from './response-organization.dto';

/**
 * Le tableau se pagine **par colonne** : sans `salesStatus`, les cinq colonnes rendent leur
 * page courante ; avec, une seule colonne répond — c'est ainsi qu'on déroule une colonne sans
 * recharger les quatre autres.
 */
export class BoardQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SalesStatus, description: 'Narrow the answer to one column' })
  @IsOptional()
  @IsEnum(SalesStatus)
  salesStatus?: SalesStatus;

  // Seul le défaut change : une colonne de kanban se lit d'un coup d'œil, comme l'agenda
  // charge son mois. Les contraintes (entier, 1..maximum) sont héritées.
  @ApiPropertyOptional({ default: BOARD_DEFAULT_LIMIT, minimum: 1, maximum: PAGINATION_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION_MAX_LIMIT)
  limit: number = BOARD_DEFAULT_LIMIT;
}

/**
 * La prochaine action planifiée de la fiche — celle-là même qui donne `nextActivityAt` et qui
 * trie la colonne. La carte porte son type et son libellé pour être lisible sans second appel :
 * « RDV physique mardi 14:30 » dit ce qu'il y a à faire, « mardi » ne dit rien.
 */
export class BoardNextActivityDto {
  @ApiProperty({ example: 'cmtj…' })
  id: string;

  @ApiProperty({ example: 'MEETING', description: 'Key of the ACTIVITY_TYPE reference list' })
  type: string;

  @ApiProperty({
    example: 'RDV physique',
    description: 'Label of that type, resolved from the project list',
  })
  title: string;

  @ApiProperty({ example: '2026-09-15' })
  date: string;

  @ApiProperty({
    example: '14:30',
    nullable: true,
    description: 'Local time as entered, or null for an all-day task',
  })
  time: string | null;
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

  @ApiPropertyOptional({
    example: '2026-09-15T00:00:00.000Z',
    nullable: true,
    description: 'Date of the next planned activity — what the column is sorted by',
  })
  nextActivityAt?: Date | null;

  @ApiPropertyOptional({
    type: BoardNextActivityDto,
    nullable: true,
    description: 'The next planned activity itself: what is to be done, not only when',
  })
  nextActivity?: BoardNextActivityDto | null;

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
