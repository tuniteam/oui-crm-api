import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

/**
 * Password policy and consent are checked in the service so that the API answers with the
 * precise codes PASSWORD_TOO_WEAK / LEGAL_CONSENT_REQUIRED (SPEC-07 US-00-02).
 */
export class ActivationCompleteDto {
  @ApiProperty({ description: 'Activation token received by e-mail.', example: 'a1b2c3d4e5f6...' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    description: 'Chosen password: at least 10 characters with letters and digits.',
    example: 'Periscolia2026!',
  })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ description: 'Acceptance of the terms of use (must be true).', example: true })
  @IsBoolean()
  acceptCgu: boolean;

  @ApiProperty({ description: 'Acceptance of the privacy policy (must be true).', example: true })
  @IsBoolean()
  acceptRgpd: boolean;
}
