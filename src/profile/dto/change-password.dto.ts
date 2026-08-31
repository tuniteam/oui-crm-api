import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** Policy checked in the service (precise PASSWORD_TOO_WEAK code, US-00-02 policy). */
export class ChangePasswordDto {
  @ApiProperty({ example: 'ouicrm2026!' })
  @IsString()
  @IsNotEmpty()
  oldPassword: string;

  @ApiProperty({ example: 'NouveauMotDePasse2026', description: 'At least 10 characters with letters and digits' })
  @IsString()
  @IsNotEmpty()
  newPassword: string;
}
