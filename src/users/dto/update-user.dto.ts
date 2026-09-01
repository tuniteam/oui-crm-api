import { USER_NAME_MAX_LENGTH } from '@/common/constants/app.constants';
import { ROLE_CODE_MAX_LENGTH } from '@/roles/roles.constants';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { DAY_PATTERN } from '@/common/utils/date.utils';
import { INITIALS_PATTERN } from '../users.constants';
import { IsCuid } from '@/common/decorators/is-cuid.decorator';
import { IsOptionalNotNull } from '@/common/decorators/optional-not-null.decorator';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Nadia' })
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(USER_NAME_MAX_LENGTH)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Karam' })
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(USER_NAME_MAX_LENGTH)
  lastName?: string;

  @ApiPropertyOptional({ example: 'NK' })
  @IsOptionalNotNull()
  @IsString()
  @Matches(INITIALS_PATTERN)
  initials?: string;

  @ApiPropertyOptional({ example: 'SALES_DIRECTOR' })
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(ROLE_CODE_MAX_LENGTH)
  roleCode?: string;

  @ApiPropertyOptional({ example: 'cmth…', nullable: true, description: 'null removes the scope' })
  @IsOptional()
  @IsCuid()
  scopeId?: string | null;

  @ApiPropertyOptional({ example: '2027-08-31', nullable: true, description: 'null removes the expiration' })
  @IsOptional()
  @Matches(DAY_PATTERN)
  expiresAt?: string | null;
}
