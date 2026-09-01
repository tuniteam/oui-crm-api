import { USER_NAME_MAX_LENGTH } from '@/common/constants/app.constants';
import { ROLE_CODE_MAX_LENGTH } from '@/roles/roles.constants';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsOptionalNotNull } from '@/common/decorators/optional-not-null.decorator';

export class UpdateBackofficeUserDto {
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

  @ApiPropertyOptional({ example: 'SUPER_ADMIN', description: 'Backoffice role; never your own' })
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(ROLE_CODE_MAX_LENGTH)
  roleCode?: string;
}
