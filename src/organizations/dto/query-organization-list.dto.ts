import { ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerStatus, Priority, SalesStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { IsCuid } from '@/common/decorators';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import {
  DEFAULT_ORGANIZATION_SORT,
  ORGANIZATION_SORT_FIELDS,
  OrganizationSortField,
} from '../organizations.constants';

export class OrganizationListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'Joigny', description: 'Name or city; a numeric input also matches the SIRET' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ example: 'COMMUNE', description: 'Key of the STRUCTURE_TYPE reference list' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  type?: string;

  @ApiPropertyOptional({ example: '89' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  department?: string;

  @ApiPropertyOptional({ example: 'Bourgogne-Franche-Comté', description: 'Expanded into its departments' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @ApiPropertyOptional({ enum: SalesStatus })
  @IsOptional()
  @IsEnum(SalesStatus)
  salesStatus?: SalesStatus;

  @ApiPropertyOptional({ enum: CustomerStatus })
  @IsOptional()
  @IsEnum(CustomerStatus)
  customerStatus?: CustomerStatus;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({ example: 'HOT', description: 'Key of the TAG reference list' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  tag?: string;

  @ApiPropertyOptional({ example: 'BL_ENFANCE', description: 'Key of the SOLUTION reference list' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  solution?: string;

  @ApiPropertyOptional({ example: 'OUTBOUND', description: 'Key of the LEAD_SOURCE reference list' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  leadSource?: string;

  @ApiPropertyOptional({ example: 'cjld2cjxh0000qzrmn831i7rn' })
  @IsOptional()
  @IsCuid()
  salesRepId?: string;

  @ApiPropertyOptional({
    example: 99,
    description: 'Keeps records whose completeness is at most this value — 99 lists incomplete records',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  completenessMax?: number;

  @ApiPropertyOptional({ enum: ORGANIZATION_SORT_FIELDS, default: DEFAULT_ORGANIZATION_SORT })
  @IsOptional()
  @IsIn(ORGANIZATION_SORT_FIELDS)
  sort?: OrganizationSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}
