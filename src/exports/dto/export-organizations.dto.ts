import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsIn, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { BulkFiltersDto } from '@/organizations/dto';
import { EXPORT_COLUMN_KEYS, EXPORT_FORMATS, ExportColumnKey, ExportFormat } from '../exports.constants';

/** The list's filters, replayed server-side — the export is "what my list shows", as a file. */
export class ExportOrganizationsDto {
  @ApiProperty({ enum: EXPORT_FORMATS, example: 'XLSX' })
  @IsIn(EXPORT_FORMATS as readonly string[])
  format: ExportFormat;

  @ApiPropertyOptional({ type: BulkFiltersDto, description: 'Same filters as GET /organizations (no paging or sorting)' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => BulkFiltersDto)
  filters?: BulkFiltersDto;

  @ApiPropertyOptional({
    type: [String],
    example: ['name', 'department', 'salesStatus'],
    description: 'Subset and order of the exported columns; defaults to all of them',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(EXPORT_COLUMN_KEYS, { each: true })
  columns?: ExportColumnKey[];
}
