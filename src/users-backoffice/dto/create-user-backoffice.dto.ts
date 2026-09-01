import { USER_NAME_MAX_LENGTH } from '@/common/constants/app.constants';
import { ROLE_CODE_MAX_LENGTH } from '@/roles/roles.constants';
import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateBackofficeUserDto {
  @ApiProperty({ example: 'email.ouicrm+admin2@gmail.com', description: 'Must be unknown: a backoffice account is dedicated' })
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

  @ApiProperty({ example: 'SUPER_ADMIN', description: 'A backoffice system role (GET /backoffice/roles)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(ROLE_CODE_MAX_LENGTH)
  roleCode: string;
}

export class CreateBackofficeUserResponseDto {
  @ApiProperty({ example: 'cmth…' })
  id: string;

  @ApiProperty({ enum: UserStatus, example: UserStatus.PENDING, description: 'PENDING = activation e-mail sent' })
  status: UserStatus;
}
