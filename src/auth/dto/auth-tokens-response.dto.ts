import { ApiProperty } from '@nestjs/swagger';

/** Returned by login, refresh and activation/complete (SPEC-07 US-00-01/02). */
export class AuthTokensResponseDto {
  @ApiProperty({
    description: 'JWT access token to send as Bearer on every request.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Single-use refresh token bound to the session (rotated on each refresh).',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;

  @ApiProperty({ description: 'Lifetime of the access token, in seconds.', example: 900 })
  expiresIn: number;
}
