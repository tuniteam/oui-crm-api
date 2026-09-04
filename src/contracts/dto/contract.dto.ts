import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingMode, ContractStatus, QuoteType } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { IsCuid } from '@/common/decorators/is-cuid.decorator';
import { IsOptionalNotNull } from '@/common/decorators/optional-not-null.decorator';
import { PaginationMetaDto, PaginationQueryDto } from '@/common/dto/pagination.dto';
import { QuoteOrgRefDto } from '@/quotes/dto/quote.dto';

// ---------------------------------------------------------------------------- requêtes

/** SPEC-07 ne définit aucun filtre : le minimum utile, aligné sur les autres listes (04/09). */
export class ContractListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ContractStatus, example: ContractStatus.ACTIVE })
  @IsOptionalNotNull()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @ApiPropertyOptional({ example: 'cmtj…' })
  @IsOptionalNotNull()
  @IsCuid()
  organizationId?: string;
}

export class AmendContractDto {
  @ApiProperty({
    enum: [QuoteType.RENEWAL, QuoteType.ADDITIONAL],
    example: QuoteType.RENEWAL,
    description: 'RENEWAL carries the service over; ADDITIONAL adds to it, setup fees excluded',
  })
  @IsEnum(QuoteType)
  type: QuoteType;
}

// ---------------------------------------------------------------------------- réponses

export class ContractDto {
  @ApiProperty({ example: 'cmtn…' }) id: string;
  @ApiProperty({ example: 'CTR-2026-247-AS001' }) number: string;
  @ApiProperty({ enum: ContractStatus }) status: ContractStatus;
  @ApiProperty({ type: QuoteOrgRefDto }) organization: QuoteOrgRefDto;

  @ApiProperty({ example: 'cmtn…', description: 'The signed quote this contract comes from' })
  quoteId: string;

  @ApiProperty({ example: 'DEV-2026-247-AS001' }) quoteNumber: string;

  @ApiProperty({ example: '2026-09-04' }) signedAt: string;
  @ApiProperty({ example: '2026-10-04' }) startDate: string;
  @ApiProperty({ example: '2029-10-04' }) endDate: string;
  @ApiProperty({ example: 36 }) commitmentMonths: number;
  @ApiProperty({ example: 2 }) noticeMonths: number;
  @ApiProperty({ example: true }) autoRenew: boolean;
  @ApiProperty({ enum: BillingMode }) billing: BillingMode;
  @ApiProperty({ example: 'CONFORT' }) plan: string;
  @ApiProperty({ example: false }) trialClause: boolean;

  @ApiProperty({ example: '450.00' }) mrrList: string;
  @ApiProperty({ example: '405.00' }) mrrNet: string;
  @ApiProperty({ example: '5400.00' }) arrList: string;
  @ApiProperty({ example: '4860.00' }) arrNet: string;
  @ApiProperty({ example: '1800.00' }) oneShotTotal: string;

  @ApiProperty({
    example: null,
    nullable: true,
    description: 'The contract this one replaces (amendment chain, SPEC-14 D16)',
  })
  sourceContractId: string | null;

  @ApiProperty({ example: '2026-09-04T09:12:31.000Z' }) createdAt: string;
}

export class ContractsListResponseDto {
  @ApiProperty({ type: [ContractDto] }) data: ContractDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta: PaginationMetaDto;
}

export class AmendResponseDto {
  @ApiProperty({ enum: ContractStatus, example: ContractStatus.AMENDING })
  contractStatus: ContractStatus;

  @ApiProperty({ example: 'cmtn…', description: 'The opportunity the amendment runs through' })
  opportunityId: string;

  @ApiProperty({ example: 'cmtn…', description: 'The prefilled draft quote' })
  quoteId: string;

  @ApiProperty({ example: 'DEV-2026-248-AS001' }) quoteNumber: string;
}
