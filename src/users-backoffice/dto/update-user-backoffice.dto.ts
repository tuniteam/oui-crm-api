import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsOptionalNotNull } from '@/common/decorators/optional-not-null.decorator';

export class UpdateBackofficeUserDto {
  @ApiPropertyOptional({ example: 'Nadia' })
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Karam' })
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ example: 'SUPER_ADMIN', description: 'Backoffice role; never your own' })
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  roleCode?: string;
}
