import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsCuid } from '@/common/decorators/is-cuid.decorator';
import { IsOptionalNotNull } from '@/common/decorators/optional-not-null.decorator';

export class UpdateUserDto {
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

  @ApiPropertyOptional({ example: 'NK' })
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(3)
  initials?: string;

  @ApiPropertyOptional({ example: 'SALES_DIRECTOR' })
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  roleCode?: string;

  @ApiPropertyOptional({ example: 'cmth…', nullable: true, description: 'null removes the scope' })
  @IsOptional()
  @IsCuid()
  scopeId?: string | null;

  @ApiPropertyOptional({ example: '2027-08-31', nullable: true, description: 'null removes the expiration' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}
