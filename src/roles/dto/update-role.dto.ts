import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OutOfScopeAccess, ScopeType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNotEmpty, IsString, MaxLength, ValidateNested } from 'class-validator';
import { IsOptionalNotNull } from '@/common/decorators/optional-not-null.decorator';
import { ROLE_LABEL_MAX_LENGTH } from '../roles.constants';

export class RoleGrantDto {
  @ApiProperty({ example: 'quotes:validate' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ enum: ScopeType, example: ScopeType.PROJECT, description: 'ALL is reserved to backoffice roles' })
  @IsEnum(ScopeType)
  scope: ScopeType;
}

/** `permissions` replaces the whole grant set of the role. */
export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'Commercial senior' })
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(ROLE_LABEL_MAX_LENGTH)
  label?: string;

  @ApiPropertyOptional({ enum: OutOfScopeAccess, example: OutOfScopeAccess.RESTRICTED })
  @IsOptionalNotNull()
  @IsEnum(OutOfScopeAccess)
  outOfScopeAccess?: OutOfScopeAccess;

  @ApiPropertyOptional({ type: [RoleGrantDto] })
  @IsOptionalNotNull()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoleGrantDto)
  permissions?: RoleGrantDto[];
}
