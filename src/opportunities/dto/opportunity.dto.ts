import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OpportunityStageCode } from '@prisma/client';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { IsCuid } from '@/common/decorators/is-cuid.decorator';
import { IsOptionalNotNull } from '@/common/decorators/optional-not-null.decorator';
import { PaginationMetaDto, PaginationQueryDto } from '@/common/dto/pagination.dto';
import { DAY_PATTERN } from '@/common/utils/date.utils';
import { UserRefDto } from '@/organizations/dto';
import {
  OPEN_STAGES,
  OPPORTUNITY_COMMENT_MAX_LENGTH,
  OPPORTUNITY_LABEL_MAX_LENGTH,
  PROBABILITY_MAX,
  PROBABILITY_MIN,
} from '../opportunities.constants';

// ---------------------------------------------------------------------------- requêtes

export class OpportunityListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OpportunityStageCode, example: OpportunityStageCode.QUOTE_SENT })
  @IsOptionalNotNull()
  @IsEnum(OpportunityStageCode)
  stage?: OpportunityStageCode;

  @ApiPropertyOptional({ example: 'cmtha…', description: 'Owner of the opportunity' })
  @IsOptionalNotNull()
  @IsCuid()
  ownerId?: string;

  @ApiPropertyOptional({ example: 'cmtj…' })
  @IsOptionalNotNull()
  @IsCuid()
  organizationId?: string;

  @ApiPropertyOptional({ example: '2026-09-01', description: 'Expected close date from (inclusive)' })
  @IsOptionalNotNull()
  @Matches(DAY_PATTERN)
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Expected close date to (inclusive)' })
  @IsOptionalNotNull()
  @Matches(DAY_PATTERN)
  to?: string;
}

export class CreateOpportunityDto {
  @ApiProperty({ example: 'cmtj…' })
  @IsCuid()
  organizationId: string;

  @ApiPropertyOptional({ example: 'Périscolaire 2027', description: 'Defaults to the organization name' })
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(OPPORTUNITY_LABEL_MAX_LENGTH)
  label?: string;

  @ApiPropertyOptional({ example: 'OUTBOUND', description: 'Key of the LEAD_SOURCE reference list' })
  @IsOptionalNotNull()
  @IsString()
  @MaxLength(60)
  source?: string;

  @ApiPropertyOptional({ example: '2027-03-31' })
  @IsOptionalNotNull()
  @Matches(DAY_PATTERN)
  expectedCloseDate?: string;

  @ApiPropertyOptional({ example: 'cmtha…', description: 'Defaults to the sales rep of the record, else the caller' })
  @IsOptionalNotNull()
  @IsCuid()
  ownerId?: string;
}

/** Champs nullables effaçables avec `null` ; l'étape ne se change pas ici (route d'action). */
export class UpdateOpportunityDto {
  @ApiPropertyOptional({ example: 'Périscolaire 2027 — phase 2' })
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(OPPORTUNITY_LABEL_MAX_LENGTH)
  label?: string;

  @ApiPropertyOptional({ example: '2027-06-30', nullable: true, description: 'null clears it' })
  @IsOptional()
  @Matches(DAY_PATTERN)
  expectedCloseDate?: string | null;

  @ApiPropertyOptional({
    example: 60,
    nullable: true,
    description: 'Hand-set weighting 0-100; null gives the probability of the stage back',
  })
  @IsOptional()
  @IsInt()
  @Min(PROBABILITY_MIN)
  @Max(PROBABILITY_MAX)
  probabilityOverride?: number | null;

  @ApiPropertyOptional({ example: 'cmtha…' })
  @IsOptionalNotNull()
  @IsCuid()
  ownerId?: string;

  @ApiPropertyOptional({ example: 'WEB_FORM', nullable: true, description: 'null clears it' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  source?: string | null;
}

export class ChangeOpportunityStageDto {
  @ApiProperty({
    enum: OPEN_STAGES,
    example: OpportunityStageCode.DEMONSTRATION,
    description: 'Open stages only: WON and LOST are set by a quote being signed or refused, or by /lose',
  })
  @IsEnum(OpportunityStageCode)
  stage: OpportunityStageCode;
}

export class LoseOpportunityDto {
  @ApiProperty({ example: 'COMPETITOR', description: 'Key of the LOSS_REASON reference list' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  lossReason: string;

  @ApiPropertyOptional({ example: 'Concurrent retenu sur le prix.' })
  @IsOptionalNotNull()
  @IsString()
  @MaxLength(OPPORTUNITY_COMMENT_MAX_LENGTH)
  comment?: string;
}

// ---------------------------------------------------------------------------- réponses

export class OpportunityOrgRefDto {
  @ApiProperty({ example: 'cmtj…' })
  id: string;

  @ApiProperty({ example: 'Commune de Joigny' })
  name: string;

  @ApiProperty({ example: 9820, nullable: true, description: 'Drives the pricing bracket of the estimate' })
  population: number | null;
}

export class OpportunityDto {
  @ApiProperty({ example: 'cmtl…' })
  id: string;

  @ApiProperty({ example: 'Commune de Joigny' })
  label: string;

  @ApiProperty({ type: OpportunityOrgRefDto })
  organization: OpportunityOrgRefDto;

  @ApiProperty({ type: UserRefDto, nullable: true })
  owner: UserRefDto | null;

  @ApiProperty({ enum: OpportunityStageCode, example: OpportunityStageCode.QUOTE_SENT })
  stage: OpportunityStageCode;

  @ApiProperty({ example: 50, description: 'Probability of the stage, from the project settings' })
  stageProbability: number;

  @ApiProperty({ example: null, nullable: true, description: 'Hand-set weighting, when there is one' })
  probabilityOverride: number | null;

  @ApiProperty({ example: 50, description: 'Effective probability = override ?? stageProbability' })
  probability: number;

  @ApiProperty({ example: 4796.4, description: 'Annual list subscription + one-shot fees' })
  value: number;

  @ApiProperty({ enum: ['QUOTE', 'ESTIMATE'], example: 'QUOTE' })
  valueSource: 'QUOTE' | 'ESTIMATE';

  @ApiProperty({ example: 2398.2, description: 'value × probability — what the pipeline forecast sums' })
  weightedValue: number;

  @ApiProperty({ example: '2027-03-31', nullable: true })
  expectedCloseDate: string | null;

  @ApiProperty({ example: 'OUTBOUND', nullable: true })
  source: string | null;

  @ApiProperty({ example: 'COMPETITOR', nullable: true })
  lossReason: string | null;

  @ApiProperty({ example: 2, description: 'Quotes attached to the opportunity' })
  quotesCount: number;

  @ApiProperty({ example: '2026-09-01T00:00:00.000Z', nullable: true, description: 'Last activity on the record' })
  lastActivityAt: Date | null;

  @ApiProperty({ example: '2026-09-03T10:12:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: null, nullable: true, description: 'Set when the opportunity is won or lost' })
  closedAt: Date | null;
}

export class OpportunityStageHistoryDto {
  @ApiProperty({ enum: OpportunityStageCode, example: OpportunityStageCode.DEMONSTRATION })
  stage: OpportunityStageCode;

  @ApiProperty({ example: '2026-09-03T10:12:00.000Z' })
  date: Date;

  @ApiProperty({ type: UserRefDto, nullable: true })
  user: UserRefDto | null;
}

export class OpportunityQuoteRefDto {
  @ApiProperty({ example: 'cmtl…' })
  id: string;

  @ApiProperty({ example: 'DEV-2026-243-WB001' })
  number: string;

  @ApiProperty({ example: 'SENT' })
  status: string;

  @ApiProperty({ example: 4796.4 })
  value: number;

  @ApiProperty({ example: '2026-08-31' })
  issueDate: string;
}

export class OpportunityDetailDto extends OpportunityDto {
  @ApiProperty({ type: [OpportunityStageHistoryDto], description: 'Oldest first — the source of cycle statistics' })
  stages: OpportunityStageHistoryDto[];

  @ApiProperty({ type: [OpportunityQuoteRefDto], description: 'Empty until the quotes of phase E' })
  quotes: OpportunityQuoteRefDto[];

  @ApiPropertyOptional({ example: 'Concurrent retenu sur le prix.', nullable: true })
  lossComment: string | null;
}

export class OpportunitiesListResponseDto {
  @ApiProperty({ type: [OpportunityDto] })
  data: OpportunityDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class OpportunityBoardColumnDto {
  @ApiProperty({ enum: OpportunityStageCode, example: OpportunityStageCode.QUALIFICATION })
  stage: OpportunityStageCode;

  @ApiProperty({ example: 10 })
  stageProbability: number;

  @ApiProperty({ example: 3, description: 'Opportunities in the column (may exceed items.length)' })
  count: number;

  @ApiProperty({ example: false, description: 'true when the column holds more than the 200 returned items' })
  hasMore: boolean;

  @ApiProperty({ example: 14389.2, description: 'Σ value of the column' })
  total: number;

  @ApiProperty({ example: 1438.92, description: 'Σ value × probability' })
  weightedTotal: number;

  @ApiProperty({ type: [OpportunityDto], description: 'Expected close date first, then label' })
  items: OpportunityDto[];
}

export class OpportunityBoardResponseDto {
  @ApiProperty({ type: [OpportunityBoardColumnDto], description: 'Always the 5 open stages, in pipeline order' })
  columns: OpportunityBoardColumnDto[];

  @ApiProperty({ example: 42, description: 'Open opportunities, every column together' })
  count: number;

  @ApiProperty({ example: 158000.4 })
  total: number;

  @ApiProperty({ example: 47120.15, description: 'The weighted pipeline' })
  weightedTotal: number;
}

export class OpportunityIdResponseDto {
  @ApiProperty({ example: 'cmtl…' })
  id: string;

  @ApiProperty({ example: 'Commune de Joigny' })
  label: string;
}
