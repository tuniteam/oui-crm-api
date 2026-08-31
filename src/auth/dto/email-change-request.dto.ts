import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class EmailChangeRequestDto {
  @ApiProperty({ example: 'email.ouicrm+wiem2@gmail.com', description: 'New e-mail address' })
  @IsEmail()
  newEmail: string;

  @ApiProperty({ example: 'Periscolia2026!', description: 'Current password (re-authentication)' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;
}
