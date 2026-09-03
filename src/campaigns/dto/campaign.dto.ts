import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CampaignStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { IsCuid } from '@/common/decorators/is-cuid.decorator';
import { IsOptionalNotNull } from '@/common/decorators/optional-not-null.decorator';
import { PaginationMetaDto, PaginationQueryDto } from '@/common/dto/pagination.dto';
import { DAY_PATTERN } from '@/common/utils/date.utils';
import { UserRefDto } from '@/organizations/dto';
import {
  CAMPAIGN_DESCRIPTION_MAX_LENGTH,
  CAMPAIGN_NAME_MAX_LENGTH,
  CAMPAIGN_TARGET_BATCH_MAX,
} from '../campaigns.constants';

export class CreateCampaignDto {
  @ApiProperty({ example: 'Rentrée 89' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(CAMPAIGN_NAME_MAX_LENGTH)
  name: string;

  @ApiPropertyOptional({ example: 'Communes de l’Yonne sans logiciel identifié.' })
  @IsOptional()
  @IsString()
  @MaxLength(CAMPAIGN_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { department: '89', solution: 'NO_SOFTWARE' },
    description: 'Documentary only: the target list is frozen, the criteria are how it was built',
  })
  @IsOptional()
  @IsObject()
  criteria?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'cmth…', description: 'Defaults to the caller' })
  @IsOptional()
  @IsCuid()
  ownerId?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @Matches(DAY_PATTERN)
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @Matches(DAY_PATTERN)
  endDate?: string;
}

/** Nullable fields are cleared with null; the name never is. */
export class UpdateCampaignDto {
  @ApiPropertyOptional({ example: 'Rentrée 89 bis' })
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CAMPAIGN_NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(CAMPAIGN_DESCRIPTION_MAX_LENGTH)
  description?: string | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptionalNotNull()
  @IsObject()
  criteria?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'cmth…', nullable: true, description: 'null removes the owner' })
  @IsOptional()
  @IsCuid()
  ownerId?: string | null;

  @ApiPropertyOptional({ example: '2026-09-01', nullable: true })
  @IsOptional()
  @Matches(DAY_PATTERN)
  startDate?: string | null;

  @ApiPropertyOptional({ example: '2026-12-31', nullable: true })
  @IsOptional()
  @Matches(DAY_PATTERN)
  endDate?: string | null;
}

export class ChangeCampaignStatusDto {
  @ApiProperty({ enum: CampaignStatus, example: CampaignStatus.ACTIVE })
  @IsEnum(CampaignStatus)
  status: CampaignStatus;
}

export class TargetOrganizationsDto {
  @ApiProperty({ type: [String], example: ['cmtj…', 'cmtj…'], description: `${CAMPAIGN_TARGET_BATCH_MAX} ids max — the big selections go through US-01-05` })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CAMPAIGN_TARGET_BATCH_MAX)
  @ArrayUnique()
  @IsCuid({ each: true })
  ids: string[];
}

export class TargetOrganizationsResponseDto {
  @ApiProperty({ example: 12, description: 'Newly targeted records' })
  added: number;

  @ApiProperty({ example: 3, description: 'Already in the campaign (idempotent)' })
  alreadyIn: number;

  @ApiProperty({ example: 1, description: 'Unknown, deleted or out-of-scope records — never a global failure' })
  skipped: number;
}

export class CampaignResultsDto {
  @ApiProperty({ example: 8, description: 'Activities attached to the campaign' })
  activities: number;

  @ApiProperty({ example: 0, description: 'Arrives with lot L2' })
  opportunities: number;

  @ApiProperty({ example: 0, description: 'Arrives with lot L2' })
  quotes: number;

  @ApiProperty({ example: 0, description: 'Arrives with lot L2' })
  signed: number;
}

export class CampaignDto {
  @ApiProperty({ example: 'cmtj…' })
  id: string;

  @ApiProperty({ example: 'Rentrée 89' })
  name: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  description: string | null;

  @ApiProperty({ enum: CampaignStatus, example: CampaignStatus.ACTIVE })
  status: CampaignStatus;

  @ApiPropertyOptional({ type: UserRefDto, nullable: true })
  owner: UserRefDto | null;

  @ApiPropertyOptional({ example: '2026-09-01', nullable: true })
  startDate: string | null;

  @ApiPropertyOptional({ example: '2026-12-31', nullable: true })
  endDate: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true, example: { department: '89' } })
  criteria: Record<string, unknown>;

  @ApiProperty({ example: 42 })
  organizationsCount: number;

  @ApiProperty({ type: CampaignResultsDto })
  results: CampaignResultsDto;
}

export class CampaignsListResponseDto {
  @ApiProperty({ type: [CampaignDto] })
  data: CampaignDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class CampaignIdResponseDto {
  @ApiProperty({ example: 'cmtj…' })
  id: string;

  @ApiProperty({ example: 'Rentrée 89' })
  name: string;
}

export class CampaignListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CampaignStatus })
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;
}

export class CampaignOrganizationItemDto {
  @ApiProperty({ example: 'cmtj…' })
  id: string;

  @ApiProperty({ example: 'Commune de Joigny' })
  name: string;

  @ApiPropertyOptional({ example: 'Joigny', nullable: true })
  city: string | null;

  @ApiProperty({ example: '89' })
  department: string;

  @ApiProperty({ example: 'TO_CONTACT' })
  salesStatus: string;

  @ApiProperty({ enum: ['FULL', 'RESTRICTED'], example: 'FULL' })
  access: 'FULL' | 'RESTRICTED';

  @ApiProperty({ example: '2026-09-02T10:00:00.000Z' })
  addedAt: Date;
}

export class CampaignOrganizationsResponseDto {
  @ApiProperty({ type: [CampaignOrganizationItemDto] })
  data: CampaignOrganizationItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class CampaignResultRowDto {
  @ApiProperty({ example: 'cmtj…' })
  organizationId: string;

  @ApiProperty({ example: 'Commune de Joigny' })
  name: string;

  @ApiProperty({ example: 'IN_PROGRESS' })
  salesStatus: string;

  @ApiProperty({
    enum: ['FULL', 'RESTRICTED'],
    example: 'FULL',
    description: 'Geographic access of the caller to this record; RESTRICTED hides lastActivityAt',
  })
  access: 'FULL' | 'RESTRICTED';

  @ApiProperty({ example: 3, description: 'Activities of the campaign on this record' })
  activities: number;

  @ApiPropertyOptional({
    example: '2026-09-02T00:00:00.000Z',
    nullable: true,
    description: 'Absent from the payload when access is RESTRICTED',
  })
  lastActivityAt?: Date | null;
}

export class CampaignResultsResponseDto {
  @ApiProperty({
    type: CampaignResultsDto,
    description: 'Computed over the WHOLE campaign, never over the current page',
  })
  totals: CampaignResultsDto;

  @ApiProperty({ type: [CampaignResultRowDto], description: 'One row per targeted record' })
  data: CampaignResultRowDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
