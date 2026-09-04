import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingMode, QuoteLineNature, QuoteOrigin, QuoteStatus, QuoteType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsCuid } from '@/common/decorators/is-cuid.decorator';
import { IsOptionalNotNull } from '@/common/decorators/optional-not-null.decorator';
import { PaginationMetaDto, PaginationQueryDto } from '@/common/dto/pagination.dto';
import { DAY_PATTERN } from '@/common/utils/date.utils';
import { UserRefDto } from '@/organizations/dto';
import { DISCOUNT_MAX, DISCOUNT_MIN } from '@/pricing/pricing.constants';
import { PLAN_KEY_MAX_LENGTH, REASON_MAX_LENGTH } from '../quotes.constants';

const MAX_LINES = 50;

// ---------------------------------------------------------------------------- configuration

export class QuoteLineConfigDto {
  @ApiProperty({ example: 1, description: 'Identifier of the option or extra in the grid' })
  @IsInt()
  @Min(0)
  id: number;

  @ApiProperty({ example: 3, description: 'Quantity asked; only the part above the included quota is billed' })
  @IsNumber()
  @Min(0)
  qty: number;

  @ApiPropertyOptional({ example: 0, description: 'Line discount, 0-100' })
  @IsOptional()
  @IsInt()
  @Min(DISCOUNT_MIN)
  @Max(DISCOUNT_MAX)
  discount?: number;
}

export class GlobalDiscountDto {
  @ApiProperty({ enum: ['NONE', 'PERCENT', 'FREE_MONTHS'], example: 'PERCENT' })
  @IsEnum({ NONE: 'NONE', PERCENT: 'PERCENT', FREE_MONTHS: 'FREE_MONTHS' })
  mode: 'NONE' | 'PERCENT' | 'FREE_MONTHS';

  @ApiPropertyOptional({ example: 20, description: 'PERCENT only' })
  @IsOptional()
  @IsInt()
  @Min(DISCOUNT_MIN)
  @Max(DISCOUNT_MAX)
  percent?: number;

  @ApiPropertyOptional({ example: 12, description: 'Months the discount runs; default 12 (PERCENT) or 2 (FREE_MONTHS)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  months?: number;
}

/** Ce que le configurateur envoie — SPEC-04 §2.1. */
export class QuoteConfigDto {
  @ApiProperty({ example: 'CONFORT', description: 'Plan key of the active grid' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PLAN_KEY_MAX_LENGTH)
  plan: string;

  @ApiPropertyOptional({ example: 0, description: 'Discount on the subscription line, 0-100' })
  @IsOptional()
  @IsInt()
  @Min(DISCOUNT_MIN)
  @Max(DISCOUNT_MAX)
  subscriptionDiscount?: number;

  @ApiPropertyOptional({ type: [QuoteLineConfigDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LINES)
  @ValidateNested({ each: true })
  @Type(() => QuoteLineConfigDto)
  options?: QuoteLineConfigDto[];

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { deployment: { included: true, discount: 0 }, training: { included: true, discount: 25 } },
    description: 'One entry per setup fee kept, keyed as in the grid',
  })
  @IsOptional()
  @IsObject()
  setup?: Record<string, { included: boolean; discount?: number }>;

  @ApiPropertyOptional({ type: [QuoteLineConfigDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LINES)
  @ValidateNested({ each: true })
  @Type(() => QuoteLineConfigDto)
  extras?: QuoteLineConfigDto[];

  @ApiPropertyOptional({ type: GlobalDiscountDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GlobalDiscountDto)
  globalDiscount?: GlobalDiscountDto;

  @ApiPropertyOptional({ example: 36, description: 'Defaults to the project setting' })
  @IsOptional()
  @IsInt()
  @Min(1)
  commitmentMonths?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  cancellable?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  trialClause?: boolean;

  @ApiPropertyOptional({ enum: BillingMode, example: BillingMode.MONTHLY })
  @IsOptional()
  @IsEnum(BillingMode)
  billing?: BillingMode;
}

// ---------------------------------------------------------------------------- requêtes

export class SimulateQuoteDto {
  @ApiProperty({ example: 'cmtj…' })
  @IsCuid()
  organizationId: string;

  @ApiProperty({ type: QuoteConfigDto })
  @ValidateNested()
  @Type(() => QuoteConfigDto)
  config: QuoteConfigDto;

  @ApiPropertyOptional({ example: '2027-01-01', description: 'Defaults to today + 30 days (SPEC-04 déc. 4)' })
  @IsOptionalNotNull()
  @Matches(DAY_PATTERN)
  startDate?: string;

  @ApiPropertyOptional({ example: 'cmtl…', description: 'Simulate against another grid version than the active one' })
  @IsOptionalNotNull()
  @IsCuid()
  pricingGridId?: string;
}

export class CreateQuoteDto extends SimulateQuoteDto {
  @ApiPropertyOptional({ example: 'cmtl…', description: 'Defaults to the open opportunity of the record, created if none' })
  @IsOptionalNotNull()
  @IsCuid()
  opportunityId?: string;

  @ApiPropertyOptional({ enum: QuoteType, example: QuoteType.INITIAL })
  @IsOptionalNotNull()
  @IsEnum(QuoteType)
  type?: QuoteType;
}

/** Un brouillon se modifie ; un devis soumis ne bouge plus (409). */
export class UpdateQuoteDto {
  @ApiPropertyOptional({ type: QuoteConfigDto })
  @IsOptionalNotNull()
  @ValidateNested()
  @Type(() => QuoteConfigDto)
  config?: QuoteConfigDto;

  @ApiPropertyOptional({ example: '2027-02-01' })
  @IsOptionalNotNull()
  @Matches(DAY_PATTERN)
  startDate?: string;

  @ApiPropertyOptional({ enum: QuoteType })
  @IsOptionalNotNull()
  @IsEnum(QuoteType)
  type?: QuoteType;
}

export class QuoteListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'cmtj…' })
  @IsOptionalNotNull()
  @IsCuid()
  organizationId?: string;

  @ApiPropertyOptional({ example: 'cmtl…' })
  @IsOptionalNotNull()
  @IsCuid()
  opportunityId?: string;

  @ApiPropertyOptional({ enum: QuoteStatus })
  @IsOptionalNotNull()
  @IsEnum(QuoteStatus)
  status?: QuoteStatus;

  @ApiPropertyOptional({ example: 'cmtha…' })
  @IsOptionalNotNull()
  @IsCuid()
  ownerId?: string;

  @ApiPropertyOptional({ example: '2026-09-01', description: 'Issue date from (inclusive)' })
  @IsOptionalNotNull()
  @Matches(DAY_PATTERN)
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Issue date to (inclusive)' })
  @IsOptionalNotNull()
  @Matches(DAY_PATTERN)
  to?: string;
}

// ---------------------------------------------------------------------------- réponses

export class QuoteLineDto {
  @ApiProperty({ enum: QuoteLineNature, example: QuoteLineNature.ABONNEMENT })
  nature: QuoteLineNature;

  @ApiProperty({ example: 'Abonnement CONFORT' })
  label: string;

  @ApiProperty({ example: '2 501 – 4 999 hab.' })
  sublabel: string;

  @ApiProperty({ example: 1 })
  qty: number;

  @ApiProperty({ example: 79.9 })
  unitPrice: number;

  @ApiProperty({ example: 0, description: 'Line discount in %' })
  discount: number;

  @ApiProperty({ example: 79.9 })
  total: number;
}

export class QuoteYearDto {
  @ApiProperty({ example: 2027 })
  year: number;

  @ApiProperty({ example: 12, description: 'Subscription months billed that calendar year' })
  months: number;

  @ApiProperty({ example: 958.8 })
  subscription: number;

  @ApiProperty({ example: 1500 })
  setup: number;

  @ApiProperty({ example: 1250 })
  training: number;

  @ApiProperty({ example: 0 })
  hardware: number;

  @ApiProperty({ example: 3708.8 })
  totalHt: number;

  @ApiProperty({ example: 4450.56 })
  totalTtc: number;
}

/** Le calcul complet — ce que le configurateur affiche (SPEC-04 §2.2). */
export class QuoteResultDto {
  @ApiProperty({ example: 3 })
  bracketIndex: number;

  @ApiProperty({ example: '2 501 – 4 999 hab.' })
  bracketLabel: string;

  @ApiProperty({ example: 79.9 })
  subscriptionUnitPrice: number;

  @ApiProperty({ type: [QuoteLineDto], description: 'Subscription then options' })
  subscriptionLines: QuoteLineDto[];

  @ApiProperty({ type: [QuoteLineDto], description: 'Setup fees then extras' })
  setupLines: QuoteLineDto[];

  @ApiProperty({ example: 79.9, description: 'Monthly, list price, line discounts applied' })
  mrrList: number;

  @ApiProperty({ example: 63.92, description: 'Monthly in steady state, global discount applied' })
  mrrNet: number;

  @ApiProperty({ example: 958.8 })
  arrList: number;

  @ApiProperty({ example: 767.04 })
  arrNet: number;

  @ApiProperty({ example: { setup: 1500, training: 1250, hardware: 0, total: 2750 } })
  oneShot: { setup: number; training: number; hardware: number; total: number };

  @ApiProperty({ example: { subscription: 958.8, totalHt: 3708.8, vat: 741.76, totalTtc: 4450.56 } })
  firstYear: { subscription: number; totalHt: number; vat: number; totalTtc: number };

  @ApiProperty({ type: [QuoteYearDto], description: 'Four calendar years from the start date' })
  multiYear: QuoteYearDto[];

  @ApiProperty({ example: 25, description: 'Strongest discount of the quote, every line included' })
  maxDiscount: number;

  @ApiProperty({ example: false, description: 'maxDiscount above the project discount cap' })
  requiresValidation: boolean;
}

export class QuoteOrgRefDto {
  @ApiProperty({ example: 'cmtj…' })
  id: string;

  @ApiProperty({ example: 'Commune de Joigny' })
  name: string;

  @ApiProperty({ example: 9820, nullable: true })
  population: number | null;
}

export class QuoteDto {
  @ApiProperty({ example: 'cmtl…' })
  id: string;

  @ApiProperty({ example: 'DEV-2026-243-WB001' })
  number: string;

  @ApiProperty({ example: null, nullable: true, description: 'Number carried over from the workbook' })
  legacyNumber: string | null;

  @ApiProperty({ enum: QuoteOrigin, example: QuoteOrigin.CRM })
  origin: QuoteOrigin;

  @ApiProperty({ enum: QuoteType, example: QuoteType.INITIAL })
  type: QuoteType;

  @ApiProperty({ enum: QuoteStatus, example: QuoteStatus.DRAFT })
  status: QuoteStatus;

  @ApiProperty({ type: QuoteOrgRefDto })
  organization: QuoteOrgRefDto;

  @ApiProperty({ example: 'cmtl…', nullable: true })
  opportunityId: string | null;

  @ApiProperty({ type: UserRefDto, nullable: true })
  owner: UserRefDto | null;

  @ApiProperty({ example: '2026-08-31' })
  issueDate: string;

  @ApiProperty({ example: '2026-09-30' })
  validUntil: string;

  @ApiProperty({ example: '2026-09-30' })
  startDate: string;

  @ApiProperty({ example: 'CONFORT', nullable: true, description: 'Plan of the configuration' })
  plan: string | null;

  @ApiProperty({ example: 79.9 })
  mrrList: number;

  @ApiProperty({ example: 79.9 })
  mrrNet: number;

  @ApiProperty({ example: 2750 })
  oneShotTotal: number;

  @ApiProperty({ example: 3708.8 })
  firstYearHt: number;

  @ApiProperty({ example: 0 })
  maxDiscount: number;

  @ApiProperty({ example: false })
  requiresValidation: boolean;

  @ApiProperty({ example: null, nullable: true })
  signedAt: string | null;

  @ApiProperty({ example: '2026-09-03T10:12:00.000Z' })
  createdAt: Date;
}

export class QuoteHistoryEntryDto {
  @ApiProperty({ enum: QuoteStatus, example: QuoteStatus.DRAFT })
  status: QuoteStatus;

  @ApiProperty({ example: '2026-09-03T10:12:00.000Z' })
  at: Date;

  @ApiProperty({ type: UserRefDto, nullable: true })
  by: UserRefDto | null;
}

export class QuoteDocumentDto {
  @ApiProperty({ example: 'cmtf…' })
  id: string;

  @ApiProperty({ example: 'Periscolia_Devis_DEV-2026-243-WB001.pdf' })
  fileName: string;

  @ApiProperty({ example: '2026-09-03T10:12:00.000Z' })
  createdAt: Date;
}

export class QuoteDetailDto extends QuoteDto {
  @ApiProperty({ type: QuoteConfigDto, nullable: true, description: 'null for a quote carried over from the workbook' })
  config: QuoteConfigDto | null;

  @ApiProperty({ type: QuoteResultDto })
  result: QuoteResultDto;

  @ApiProperty({ type: [QuoteLineDto], description: 'Computed while DRAFT, frozen once submitted' })
  lines: QuoteLineDto[];

  @ApiProperty({ type: [QuoteDocumentDto], description: 'Empty until the PDF of phase H' })
  documents: QuoteDocumentDto[];

  @ApiProperty({ type: [QuoteHistoryEntryDto], description: 'Rebuilt from the audit journal' })
  history: QuoteHistoryEntryDto[];

  @ApiProperty({ example: 2, description: 'Grid version the amounts come from' })
  pricingGridVersion: number;
}

export class QuotesListResponseDto {
  @ApiProperty({ type: [QuoteDto] })
  data: QuoteDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

/** Motif facultatif d'un renvoi au brouillon ou d'un refus client. */
export class RejectQuoteDto {
  @ApiPropertyOptional({ example: 'Remise trop forte pour la marge cible.' })
  @IsOptionalNotNull()
  @IsString()
  @MaxLength(REASON_MAX_LENGTH)
  reason?: string;
}

/** Ce que renvoie une transition : le statut atteint, et s'il attend une validation. */
export class QuoteStatusResponseDto {
  @ApiProperty({ example: 'cmtl…' })
  id: string;

  @ApiProperty({ example: 'DEV-2026-243-WB001' })
  number: string;

  @ApiProperty({ enum: QuoteStatus, example: QuoteStatus.SENT })
  status: QuoteStatus;

  @ApiProperty({ example: false, description: 'true when the discount put the quote in the validation loop' })
  requiresValidation: boolean;
}

export class SignQuoteDto {
  @ApiProperty({ example: '2026-09-04', description: 'The day the client signed — never in the future' })
  @Matches(DAY_PATTERN)
  signedAt: string;
}

export class SignResponseDto {
  @ApiProperty({ example: 'cmtn…' })
  contractId: string;

  @ApiProperty({ example: 'CTR-2026-247-AS001' })
  contractNumber: string;

  @ApiProperty({
    example: null,
    nullable: true,
    description: 'Always null at L2: the deployment is an L4 object (SPEC-14 D1)',
  })
  deploymentId: string | null;
}

export class SignedReturnResponseDto {
  @ApiProperty({ example: 'cmtn…' })
  fileId: string;
}

export class QuoteIdResponseDto {
  @ApiProperty({ example: 'cmtl…' })
  id: string;

  @ApiProperty({ example: 'DEV-2026-243-WB001' })
  number: string;
}
