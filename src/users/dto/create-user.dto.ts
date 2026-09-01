import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { IsBoolean, IsDateString, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsCuid } from '@/common/decorators/is-cuid.decorator';

export class CreateUserDto {
  @ApiProperty({ example: 'email.ouicrm+nouveau@gmail.com', description: 'Globally unique; an existing user is attached to the project, not recreated' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Nadia' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Karam' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ example: 'NK', description: 'Unique within the project (quote numbering)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(3)
  initials: string;

  @ApiProperty({ example: 'SALES_REP', description: 'System (non-backoffice) role code or a role of this project' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  roleCode: string;

  @ApiPropertyOptional({ example: 'cmth…', description: 'Geographic scope of this project', nullable: true })
  @IsOptional()
  @IsCuid()
  scopeId?: string | null;

  @ApiProperty({ example: false, description: 'External collaborator: expiresAt becomes mandatory' })
  @IsBoolean()
  isExternal: boolean;

  @ApiPropertyOptional({ example: '2027-08-31', description: 'Last day of validity (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class CreateUserResponseDto {
  @ApiProperty({ example: 'cmth…' })
  id: string;

  @ApiProperty({ enum: UserStatus, example: UserStatus.PENDING, description: 'PENDING = activation e-mail sent; ACTIVE = existing user attached' })
  status: UserStatus;
}
