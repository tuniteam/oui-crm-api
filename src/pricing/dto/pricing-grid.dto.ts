import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, Matches, Min } from 'class-validator';
import { PaginationMetaDto, PaginationQueryDto } from '@/common/dto/pagination.dto';
import { DAY_PATTERN } from '@/common/utils/date.utils';
import { UserRefDto } from '@/organizations/dto';
import { INITIAL_PRICING_GRID_VERSION } from '@/projects/project-config.constants';
import { PricingGridContent } from '../pricing.types';

const CONTENT_EXAMPLE = {
  brackets: [
    { label: '0 – 500 hab.', min: 0, max: 500 },
    { label: 'Plus de 500 hab.', min: 501, max: null },
  ],
  plans: ['ESSENTIEL', 'PREMIUM'],
  subscription: { ESSENTIEL: [19.9, 39.9], PREMIUM: [29.9, 99] },
  options: [{ id: 0, name: 'Interface comptable', unitPrice: [4, 8] }],
  setupFees: { deployment: { label: 'Déploiement', ESSENTIEL: [375, 375], PREMIUM: [375, 500] } },
  extras: [{ id: 0, name: 'Tablette de pointage', unitPrice: 500 }],
};

/**
 * Nouvelle version de grille. Le contenu est fourni tel quel, ou copié d'une version
 * existante par `fromVersion` puis, si `content` est présent, remplacé par celui-ci.
 */
export class CreatePricingGridDto {
  @ApiPropertyOptional({
    example: INITIAL_PRICING_GRID_VERSION,
    description: 'Version to copy the content from when `content` is omitted',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  fromVersion?: number;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, example: CONTENT_EXAMPLE })
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @ApiProperty({ example: '2027-01-01', description: 'Day the new prices are meant to apply from' })
  @Matches(DAY_PATTERN)
  effectiveDate: string;
}

/** Une version dans la liste : ce qu'il faut pour choisir, sans le contenu complet. */
export class PricingGridListItemDto {
  @ApiProperty({ example: 'cmth…' })
  id: string;

  @ApiProperty({ example: 2 })
  version: number;

  @ApiProperty({ example: '2027-01-01' })
  effectiveDate: string;

  @ApiProperty({ example: true, description: 'Exactly one version is active per project' })
  active: boolean;

  @ApiProperty({ type: UserRefDto, nullable: true })
  createdBy: UserRefDto | null;

  @ApiProperty({ example: '2026-09-03T10:12:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: 12, description: 'Quotes frozen on this version — it can no longer be edited' })
  quotesCount: number;
}

export class PricingGridsListResponseDto {
  @ApiProperty({ type: [PricingGridListItemDto] })
  data: PricingGridListItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

/** Le contenu complet d'une version : la grille que le configurateur affiche. */
export class PricingGridDetailDto extends PricingGridListItemDto {
  @ApiProperty({ type: 'object', additionalProperties: true, example: CONTENT_EXAMPLE })
  content: PricingGridContent;
}

export class PricingGridIdResponseDto {
  @ApiProperty({ example: 'cmth…' })
  id: string;

  @ApiProperty({ example: 2 })
  version: number;
}
