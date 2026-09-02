import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { USER_NAME_MAX_LENGTH } from '@/common/constants/app.constants';
import { IsOptionalNotNull } from '@/common/decorators/optional-not-null.decorator';
import { CIVILITY_MAX_LENGTH, EMAIL_MAX_LENGTH, NOTES_MAX_LENGTH, PHONE_MAX_LENGTH, ROLE_MAX_LENGTH } from '../contacts.constants';

/** Optional free-text fields accept null to be cleared; names never do. */
export class UpdateContactDto {
  @ApiPropertyOptional({ example: 'M.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(CIVILITY_MAX_LENGTH)
  civility?: string | null;

  @ApiPropertyOptional({ example: 'Hélène' })
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(USER_NAME_MAX_LENGTH)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Lemarchand' })
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(USER_NAME_MAX_LENGTH)
  lastName?: string;

  @ApiPropertyOptional({ example: 'DGS', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(ROLE_MAX_LENGTH)
  role?: string | null;

  @ApiPropertyOptional({ example: 'h.lemarchand@caen.fr', nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email?: string | null;

  @ApiPropertyOptional({ example: '02 31 30 41 12', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(PHONE_MAX_LENGTH)
  phone?: string | null;

  @ApiPropertyOptional({ example: '06 12 34 56 78', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(PHONE_MAX_LENGTH)
  mobile?: string | null;

  @ApiPropertyOptional({ example: true, description: 'true demotes the current primary; false steps down' })
  @IsOptionalNotNull()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptionalNotNull()
  @IsBoolean()
  optOut?: boolean;

  @ApiPropertyOptional({ example: 'Parti à la retraite.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(NOTES_MAX_LENGTH)
  notes?: string | null;
}
