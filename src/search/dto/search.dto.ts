import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';
import { SEARCH_MIN_LENGTH } from '../search.constants';

export class SearchQueryDto {
  @ApiProperty({ example: 'joigny', description: `At least ${SEARCH_MIN_LENGTH} characters` })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(SEARCH_MIN_LENGTH)
  q: string;
}

export class SearchOrgDto {
  @ApiProperty({ example: 'cmtj…' })
  id: string;

  @ApiProperty({ example: 'Commune de Joigny' })
  name: string;

  @ApiProperty({ example: 'COMMUNE' })
  type: string;

  @ApiPropertyOptional({ example: 'Joigny', nullable: true })
  city: string | null;

  @ApiProperty({ example: '89' })
  department: string;

  @ApiProperty({ example: 'TO_CONTACT' })
  salesStatus: string;

  @ApiProperty({ enum: ['FULL', 'RESTRICTED'], example: 'FULL' })
  access: 'FULL' | 'RESTRICTED';
}

export class SearchContactDto {
  @ApiProperty({ example: 'cmtj…' })
  id: string;

  @ApiProperty({ example: 'Marie' })
  firstName: string;

  @ApiProperty({ example: 'Durand' })
  lastName: string;

  @ApiPropertyOptional({ example: 'DGS', nullable: true })
  role: string | null;

  @ApiPropertyOptional({ example: 'm.durand@joigny.fr', nullable: true })
  email: string | null;

  @ApiProperty({ type: SearchOrgDto })
  organization: SearchOrgDto;
}

/**
 * One key per searchable type; a key is present only when the caller holds that type's read
 * permission. `quotes` and `contracts` are part of the contract already — they stay empty
 * until their lots (L2/L3) bring the tables.
 */
export class SearchResponseDto {
  @ApiPropertyOptional({ type: [SearchOrgDto] })
  organizations?: SearchOrgDto[];

  @ApiPropertyOptional({ type: [SearchContactDto] })
  contacts?: SearchContactDto[];

  @ApiPropertyOptional({ type: [Object], example: [], description: 'Arrives with lot L2' })
  quotes?: unknown[];

  @ApiPropertyOptional({ type: [Object], example: [], description: 'Arrives with lot L3' })
  contracts?: unknown[];
}
