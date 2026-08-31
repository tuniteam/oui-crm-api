import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** Body of the routes that only carry an e-mailed token (validate / confirm). */
export class TokenDto {
  @ApiProperty({
    description: 'Token received by e-mail (query string of the link).',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class TokenValidResponseDto {
  @ApiProperty({ example: true })
  valid: boolean;
}
