import { ApiProperty } from '@nestjs/swagger';

export class EmailChangeConfirmResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'email.ouicrm+wiem2@gmail.com', description: 'E-mail now in force' })
  email: string;
}
