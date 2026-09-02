import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { USER_NAME_MAX_LENGTH } from '@/common/constants/app.constants';
import { CIVILITY_MAX_LENGTH, EMAIL_MAX_LENGTH, NOTES_MAX_LENGTH, PHONE_MAX_LENGTH, ROLE_MAX_LENGTH } from '../contacts.constants';

export class CreateContactDto {
  @ApiPropertyOptional({ example: 'Mme' })
  @IsOptional()
  @IsString()
  @MaxLength(CIVILITY_MAX_LENGTH)
  civility?: string;

  @ApiProperty({ example: 'Hélène' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(USER_NAME_MAX_LENGTH)
  firstName: string;

  @ApiProperty({ example: 'Lemarchand' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(USER_NAME_MAX_LENGTH)
  lastName: string;

  @ApiPropertyOptional({ example: 'DGS', description: 'Function within the organization' })
  @IsOptional()
  @IsString()
  @MaxLength(ROLE_MAX_LENGTH)
  role?: string;

  @ApiPropertyOptional({ example: 'h.lemarchand@caen.fr', description: 'Required to be targeted by an e-mail campaign' })
  @IsOptional()
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email?: string;

  @ApiPropertyOptional({ example: '02 31 30 41 12' })
  @IsOptional()
  @IsString()
  @MaxLength(PHONE_MAX_LENGTH)
  phone?: string;

  @ApiPropertyOptional({ example: '06 12 34 56 78' })
  @IsOptional()
  @IsString()
  @MaxLength(PHONE_MAX_LENGTH)
  mobile?: string;

  @ApiPropertyOptional({ example: true, description: 'Legal representative / main contact — the previous one is demoted' })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Refuses to be canvassed: excluded from campaigns' })
  @IsOptional()
  @IsBoolean()
  optOut?: boolean;

  @ApiPropertyOptional({ example: 'Ne pas appeler le mercredi.' })
  @IsOptional()
  @IsString()
  @MaxLength(NOTES_MAX_LENGTH)
  notes?: string;
}
