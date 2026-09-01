import { ApiProperty } from '@nestjs/swagger';
import { ScopeNature } from '@prisma/client';

export class ScopeResponseDto {
  @ApiProperty({ example: 'cmth…' })
  id: string;

  @ApiProperty({ example: 'Normandie' })
  name: string;

  @ApiProperty({ example: 'Les cinq départements normands.' })
  description: string;

  @ApiProperty({ type: [String], example: ['Normandie'] })
  regions: string[];

  @ApiProperty({ type: [String], example: [], description: 'Departments added on top of the regions' })
  departments: string[];

  @ApiProperty({ example: false })
  portfolioOnly: boolean;

  @ApiProperty({ enum: ScopeNature, example: ScopeNature.ALL })
  nature: ScopeNature;

  @ApiProperty({ example: 2, description: 'Active assignments using this scope' })
  usersCount: number;

  @ApiProperty({ type: [String], example: ['14', '27', '50', '61', '76'], description: 'Regions resolved to departments + explicit departments, deduplicated and sorted; empty = whole territory' })
  resolvedDepartments: string[];
}

export class ScopesListResponseDto {
  @ApiProperty({ type: [ScopeResponseDto] })
  data: ScopeResponseDto[];
}

export class GeoRegionDto {
  @ApiProperty({ example: 'Normandie' })
  name: string;

  @ApiProperty({ type: [String], example: ['14', '27', '50', '61', '76'] })
  departments: string[];
}

export class GeoRegionsResponseDto {
  @ApiProperty({ type: [GeoRegionDto] })
  data: GeoRegionDto[];
}
