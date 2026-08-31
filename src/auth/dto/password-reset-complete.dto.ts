import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class PasswordResetCompleteDto {
  @ApiProperty({ description: 'Reset token received by e-mail.', example: 'a1b2c3d4e5f6...' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    description: 'New password: at least 10 characters with letters and digits.',
    example: 'Periscolia2027!',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}
