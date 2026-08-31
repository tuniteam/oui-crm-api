import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeatureCode, ProjectStatus } from '@prisma/client';
import { PaginationMetaDto } from '@/common/dto/pagination.dto';

export class ProjectFeatureDto {
  @ApiProperty({ enum: FeatureCode, example: FeatureCode.SALES })
  code: FeatureCode;

  @ApiProperty({ example: true })
  enabled: boolean;
}

export class ProjectFeaturesResponseDto {
  @ApiProperty({ type: [ProjectFeatureDto] })
  features: ProjectFeatureDto[];
}

export class ProjectListItemResponseDto {
  @ApiProperty({ example: 'cmthas5lv009z5qp4tyv8k87s' })
  id: string;

  @ApiProperty({ example: 'periscolia' })
  slug: string;

  @ApiProperty({ example: 'Périscolia' })
  name: string;

  @ApiProperty({ example: 'Périscolia — gestion périscolaire' })
  productName: string;

  @ApiProperty({ enum: ProjectStatus, example: ProjectStatus.ACTIVE })
  status: ProjectStatus;

  @ApiProperty({ enum: FeatureCode, isArray: true, description: 'Enabled features', example: ['SALES', 'BILLING'] })
  features: FeatureCode[];

  @ApiProperty({ example: 6, description: 'Users assigned to the project' })
  userCount: number;

  @ApiProperty({ example: '2026-08-31T10:00:00.000Z' })
  createdAt: Date;
}

export class ProjectListResponseDto {
  @ApiProperty({ type: [ProjectListItemResponseDto] })
  data: ProjectListItemResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class ProjectResponseDto {
  @ApiProperty({ example: 'cmthas5lv009z5qp4tyv8k87s' })
  id: string;

  @ApiProperty({ example: 'periscolia' })
  slug: string;

  @ApiProperty({ example: 'Périscolia' })
  name: string;

  @ApiProperty({ example: 'Périscolia — gestion périscolaire' })
  productName: string;

  @ApiPropertyOptional({ example: 'Logiciel de gestion périscolaire vendu aux collectivités.', nullable: true })
  description: string | null;

  @ApiProperty({ enum: ProjectStatus, example: ProjectStatus.ACTIVE })
  status: ProjectStatus;

  @ApiPropertyOptional({ example: '2026-08-31T10:00:00.000Z', nullable: true })
  activatedAt: Date | null;

  @ApiProperty({ type: [ProjectFeatureDto] })
  features: ProjectFeatureDto[];

  @ApiProperty({ example: 6 })
  userCount: number;

  @ApiProperty({ example: '2026-08-31T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-08-31T10:00:00.000Z' })
  updatedAt: Date;
}
