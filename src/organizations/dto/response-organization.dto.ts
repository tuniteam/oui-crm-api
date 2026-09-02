import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerStatus, Priority, SalesStatus } from '@prisma/client';
import { PaginationMetaDto } from '@/common/dto/pagination.dto';
import { COMPLETENESS_FIELDS } from '../organizations.constants';

/** Minimal reference to a user, as exposed everywhere an owner is returned. */
export class UserRefDto {
  @ApiProperty({ example: 'cjld2cjxh0000qzrmn831i7rn' })
  id: string;

  @ApiProperty({ example: 'Wiem Ben Ali' })
  fullName: string;

  @ApiPropertyOptional({ example: 'WBA' })
  initials?: string | null;
}

/** A reference-list value, resolved to its label for display. */
export class ReferenceRefDto {
  @ApiProperty({ example: 'BL_ENFANCE' })
  key: string;

  @ApiPropertyOptional({ example: 'BL Enfance' })
  label?: string | null;
}

export class CompletenessDto {
  @ApiProperty({ example: 83, description: 'Percentage of the six criteria that are filled' })
  score: number;

  @ApiProperty({ example: ['EMAIL'], enum: COMPLETENESS_FIELDS, isArray: true })
  missing: string[];
}

export class CompletenessDetailDto extends CompletenessDto {
  @ApiProperty({
    example: { quote: false, contract: true },
    description: 'What the missing fields prevent: a quote needs a population, a contract needs the legal identity',
  })
  blocks: { quote: boolean; contract: boolean };
}

/**
 * A row of the list. Outside the caller's scope with a RESTRICTED role, only the fields
 * marked "restricted" are present — every other one is absent from the payload (US-01-01).
 */
export class OrganizationListItemDto {
  @ApiProperty({ example: 'cjld2cjxh0000qzrmn831i7rn', description: 'restricted' })
  id: string;

  @ApiProperty({ example: 'Commune de Joigny', description: 'restricted' })
  name: string;

  @ApiProperty({ example: 'COMMUNE', description: 'restricted' })
  type: string;

  @ApiPropertyOptional({ example: 'Joigny', description: 'restricted' })
  city?: string | null;

  @ApiProperty({ example: '89', description: 'restricted' })
  department: string;

  @ApiProperty({ enum: SalesStatus, description: 'restricted' })
  salesStatus: SalesStatus;

  @ApiProperty({ enum: CustomerStatus, description: 'restricted' })
  customerStatus: CustomerStatus;

  @ApiPropertyOptional({ type: UserRefDto, nullable: true, description: 'restricted' })
  salesRep?: UserRefDto | null;

  @ApiProperty({ enum: ['FULL', 'RESTRICTED'], example: 'FULL' })
  access: 'FULL' | 'RESTRICTED';

  @ApiPropertyOptional({ example: 9820 })
  population?: number | null;

  @ApiPropertyOptional({ example: '5 000 à 10 000 habitants', description: 'Pricing bracket label' })
  bracketLabel?: string | null;

  @ApiPropertyOptional({ enum: Priority })
  priority?: Priority;

  @ApiPropertyOptional({ example: ['HOT'] })
  tags?: string[];

  @ApiPropertyOptional({ type: ReferenceRefDto, nullable: true })
  solution?: ReferenceRefDto | null;

  @ApiPropertyOptional({ example: '2026-08-28T10:00:00.000Z', nullable: true })
  lastActivityAt?: string | null;

  @ApiPropertyOptional({ example: '2026-09-15T00:00:00.000Z', nullable: true })
  nextActivityAt?: string | null;

  @ApiPropertyOptional({ type: CompletenessDto })
  completeness?: CompletenessDto;
}

export class OrganizationListResponseDto {
  @ApiProperty({ type: [OrganizationListItemDto] })
  data: OrganizationListItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class OrganizationCountsDto {
  @ApiProperty({ example: 3 })
  contacts: number;

  @ApiProperty({ example: 12 })
  activities: number;
}

/** Full record. A RESTRICTED caller gets the list projection instead; a NONE caller gets a 404. */
export class OrganizationDetailDto extends OrganizationListItemDto {
  @ApiPropertyOptional({ example: 'Commune de ' })
  displayPrefix?: string | null;

  @ApiPropertyOptional({ example: '10298517300016' })
  siret?: string | null;

  @ApiPropertyOptional({ example: '102985173' })
  siren?: string | null;

  @ApiPropertyOptional({ example: '89206' })
  inseeCode?: string | null;

  @ApiPropertyOptional({ example: '1 quai du 1er Dragons' })
  address?: string | null;

  @ApiPropertyOptional({ example: '89300' })
  postalCode?: string | null;

  @ApiPropertyOptional({ example: 'Bourgogne-Franche-Comté', description: 'Derived from the department, never stored' })
  region?: string | null;

  @ApiPropertyOptional({ example: 'CC du Jovinien' })
  epci?: string | null;

  @ApiPropertyOptional({ example: '03 86 92 48 00' })
  phone?: string | null;

  @ApiPropertyOptional({ example: 'contact@joigny.fr' })
  email?: string | null;

  @ApiPropertyOptional({ example: 'https://www.joigny.fr' })
  website?: string | null;

  @ApiPropertyOptional({ example: 4 })
  schoolCount?: number | null;

  @ApiPropertyOptional({ example: 320 })
  childCount?: number | null;

  @ApiPropertyOptional({ type: [ReferenceRefDto] })
  services?: ReferenceRefDto[];

  @ApiPropertyOptional({ type: ReferenceRefDto, nullable: true })
  leadSource?: ReferenceRefDto | null;

  @ApiPropertyOptional({ example: 'PREMIUM' })
  targetPlan?: string | null;

  @ApiPropertyOptional({ type: UserRefDto, nullable: true })
  consultant?: UserRefDto | null;

  @ApiPropertyOptional({ type: UserRefDto, nullable: true })
  trainer?: UserRefDto | null;

  @ApiPropertyOptional({ example: 'Contact pris au salon des maires' })
  notes?: string | null;

  @ApiPropertyOptional({ example: '2026-09-01', nullable: true })
  goLiveTarget?: string | null;

  @ApiPropertyOptional({ type: CompletenessDetailDto })
  completeness?: CompletenessDetailDto;

  @ApiPropertyOptional({ type: OrganizationCountsDto })
  counts?: OrganizationCountsDto;

  @ApiPropertyOptional({ example: '2026-08-30T09:12:00.000Z' })
  createdAt?: string;

  @ApiPropertyOptional({ example: '2026-09-01T14:24:13.344Z' })
  updatedAt?: string;
}
