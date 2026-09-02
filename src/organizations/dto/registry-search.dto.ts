import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { REGISTRY } from '../registry.constants';

export class RegistrySearchQueryDto {
  @ApiProperty({ example: 'mairie de joigny', description: 'An organization name, or a 14-digit SIRET' })
  @IsString()
  @MinLength(REGISTRY.MIN_QUERY_LENGTH)
  q: string;
}

export class RegistryRowDto {
  @ApiProperty({ example: 'COMMUNE DE JOIGNY' })
  name: string;

  @ApiPropertyOptional({ example: '21890206500013', nullable: true })
  siret: string | null;

  @ApiPropertyOptional({ example: '218902065', nullable: true })
  siren: string | null;

  @ApiPropertyOptional({ example: '3 QUAI DU 1ER DRAGONS', nullable: true })
  address: string | null;

  @ApiPropertyOptional({ example: '89300', nullable: true })
  postalCode: string | null;

  @ApiPropertyOptional({ example: 'JOIGNY', nullable: true })
  city: string | null;

  @ApiPropertyOptional({ example: '89206', nullable: true })
  inseeCode: string | null;

  @ApiPropertyOptional({ example: '89', nullable: true, description: 'Derived from the INSEE code' })
  department: string | null;

  @ApiProperty({ example: true })
  isActive: boolean;
}

export class RegistrySearchResponseDto {
  @ApiProperty({ type: [RegistryRowDto] })
  data: RegistryRowDto[];
}
