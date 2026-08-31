import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class PasswordResetRequestDto {
  @ApiProperty({ example: 'email.ouicrm+wiem@gmail.com' })
  @IsEmail()
  email: string;
}
