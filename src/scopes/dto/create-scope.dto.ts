import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScopeNature } from '@prisma/client';
import { ArrayUnique, IsArray, IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { IsCuid } from '@/common/decorators/is-cuid.decorator';
import { DEPARTMENT_CODE_PATTERN, SCOPE_DESCRIPTION_MAX_LENGTH, SCOPE_NAME_MAX_LENGTH } from '../scopes.constants';

export class CreateScopeDto {
  @ApiProperty({ example: 'Normandie', description: 'Unique within the project' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(SCOPE_NAME_MAX_LENGTH)
  name: string;

  @ApiPropertyOptional({ example: 'Les cinq départements normands.' })
  @IsOptional()
  @IsString()
  @MaxLength(SCOPE_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @ApiPropertyOptional({ type: [String], example: ['Normandie'], description: 'Region names (GET /geo/regions); resolved to departments server-side' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  regions?: string[];

  @ApiPropertyOptional({ type: [String], example: ['14', '27'], description: 'Extra department codes' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Matches(DEPARTMENT_CODE_PATTERN, { each: true })
  departments?: string[];

  @ApiPropertyOptional({ example: false, description: 'true = only the records the user is assigned to (sales rep / consultant / trainer)' })
  @IsOptional()
  @IsBoolean()
  portfolioOnly?: boolean;

  @ApiPropertyOptional({ enum: ScopeNature, example: ScopeNature.ALL, description: 'Prospects, customers or both' })
  @IsOptional()
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

export class ScopeIdResponseDto {
  @ApiProperty({ example: 'cmth…' })
  id: string;

  @ApiProperty({ example: 'Normandie' })
  name: string;
}
