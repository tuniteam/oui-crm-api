import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'email.ouicrm+wiem@gmail.com', description: 'User e-mail address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Periscolia2026!', description: 'User password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
