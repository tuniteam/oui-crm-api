import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { IsCuid } from '@/common/decorators/is-cuid.decorator';
import {
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_SLUG_MAX,
  PROJECT_SLUG_MIN,
  PROJECT_SLUG_PATTERN,
} from '../projects.constants';

export class CreateProjectDto {
  @ApiProperty({
    example: 'periscolia',
    description: 'Immutable identifier used in URLs and export file names: lowercase letters, digits, dashes',
  })
  @IsString()
  @MinLength(PROJECT_SLUG_MIN)
  @MaxLength(PROJECT_SLUG_MAX)
  @Matches(PROJECT_SLUG_PATTERN)
  slug: string;

  @ApiProperty({ example: 'Périscolia', description: 'Display name of the project' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PROJECT_NAME_MAX_LENGTH)
  name: string;

  @ApiProperty({ example: 'Périscolia — gestion périscolaire', description: 'Name of the product or service sold' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PROJECT_NAME_MAX_LENGTH)
  productName: string;

  @ApiPropertyOptional({ example: 'Logiciel de gestion périscolaire vendu aux collectivités.' })
  @IsOptional()
  @IsString()
  @MaxLength(PROJECT_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @ApiPropertyOptional({
    example: 'cmthas5lv009z5qp4tyv8k87s',
    description:
      'Copies the configuration of this project (settings except company identity, stage probabilities, features, reference items, scopes, active pricing grid, HTML templates and stamp) — never its business data',
  })
  @IsOptional()
  @IsCuid()
  copyFromProjectId?: string;
}

export class CreateProjectResponseDto {
  @ApiProperty({ example: 'cmthas5lv009z5qp4tyv8k87s' })
  id: string;

  @ApiProperty({ example: 'periscolia' })
  slug: string;
}
