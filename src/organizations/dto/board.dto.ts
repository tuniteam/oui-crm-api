import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Priority, SalesStatus } from '@prisma/client';
import { UserRefDto } from './response-organization.dto';

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

  @ApiProperty({ example: 3, description: 'Total records of the column (may exceed items.length)' })
  count: number;

  @ApiProperty({ example: false, description: 'true when the column holds more than the 200 returned items' })
  hasMore: boolean;

  @ApiProperty({ type: [BoardItemDto], description: 'Next activity first, then name' })
  items: BoardItemDto[];
}

export class BoardResponseDto {
  @ApiProperty({ type: [BoardColumnDto], description: 'Always the 5 columns, in pipeline order' })
  columns: BoardColumnDto[];
}
