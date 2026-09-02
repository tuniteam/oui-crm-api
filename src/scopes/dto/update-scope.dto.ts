import { ApiPropertyOptional } from '@nestjs/swagger';
import { ScopeNature } from '@prisma/client';
import { ArrayUnique, IsArray, IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { IsCuid } from '@/common/decorators/is-cuid.decorator';
import { IsOptionalNotNull } from '@/common/decorators/optional-not-null.decorator';
import { DEPARTMENT_CODE_PATTERN, SCOPE_DESCRIPTION_MAX_LENGTH, SCOPE_NAME_MAX_LENGTH } from '../scopes.constants';

/** Lists (regions, departments) are replaced as a whole when present. */
export class UpdateScopeDto {
  @ApiPropertyOptional({ example: 'Normandie' })
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(SCOPE_NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional({ example: 'Les cinq départements normands.' })
  @IsOptionalNotNull()
  @IsString()
  @MaxLength(SCOPE_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @ApiPropertyOptional({ type: [String], example: ['Normandie'] })
  @IsOptionalNotNull()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  regions?: string[];

  @ApiPropertyOptional({ type: [String], example: ['14', '27'] })
  @IsOptionalNotNull()
  @IsArray()
  @ArrayUnique()
  @Matches(DEPARTMENT_CODE_PATTERN, { each: true })
  departments?: string[];

  @ApiPropertyOptional({ example: false })
  @IsOptionalNotNull()
  @IsBoolean()
  portfolioOnly?: boolean;

  @ApiPropertyOptional({ enum: ScopeNature })
  @IsOptionalNotNull()
  @IsEnum(ScopeNature)
  nature?: ScopeNature;

  @ApiPropertyOptional({
    type: [String],
    example: [],
    description: 'Campaigns the scope is limited to (US-01-11) — every id must be a campaign of the project',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsCuid({ each: true })
  campaignIds?: string[];
}
