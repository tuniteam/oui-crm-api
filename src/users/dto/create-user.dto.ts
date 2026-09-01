import { USER_NAME_MAX_LENGTH } from '@/common/constants/app.constants';
import { ROLE_CODE_MAX_LENGTH } from '@/roles/roles.constants';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { DAY_PATTERN } from '@/common/utils/date.utils';
import { INITIALS_PATTERN } from '../users.constants';
import { IsCuid } from '@/common/decorators/is-cuid.decorator';

export class CreateUserDto {
  @ApiProperty({ example: 'email.ouicrm+nouveau@gmail.com', description: 'Globally unique; an existing user is attached to the project, not recreated' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Nadia' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(USER_NAME_MAX_LENGTH)
  firstName: string;

  @ApiProperty({ example: 'Karam' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(USER_NAME_MAX_LENGTH)
  lastName: string;

  @ApiProperty({ example: 'NK', description: 'Unique within the project (quote numbering)' })
  @IsString()
  @Matches(INITIALS_PATTERN)
  initials: string;

  @ApiProperty({ example: 'SALES_REP', description: 'System (non-backoffice) role code or a role of this project' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(ROLE_CODE_MAX_LENGTH)
  roleCode: string;

  @ApiPropertyOptional({ example: 'cmth…', description: 'Geographic scope of this project', nullable: true })
  @IsOptional()
  @IsCuid()
  scopeId?: string | null;

  @ApiProperty({ example: false, description: 'External collaborator: expiresAt becomes mandatory' })
  @IsBoolean()
  isExternal: boolean;

  @ApiPropertyOptional({ example: '2027-08-31', description: 'Last day of validity (YYYY-MM-DD)' })
  @IsOptional()
  @Matches(DAY_PATTERN)
  expiresAt?: string;
}

export class CreateUserResponseDto {
  @ApiProperty({ example: 'cmth…' })
  id: string;

  @ApiProperty({ enum: UserStatus, example: UserStatus.PENDING, description: 'PENDING = activation e-mail sent; ACTIVE = existing user attached' })
  status: UserStatus;
}
