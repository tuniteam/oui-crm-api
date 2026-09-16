import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';
import { IsOptionalNotNull } from '@/common/decorators/optional-not-null.decorator';

export class GeoRegionsQueryDto {
  @ApiPropertyOptional({
    example: true,
    description: 'Cuts the table down to the caller scope, whatever their role (a caller without a geographic scope still gets the whole table)',
  })
  @IsOptionalNotNull()
  // Strict on purpose: anything but true/false is refused instead of silently read as false
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  withinScope?: boolean;
}
