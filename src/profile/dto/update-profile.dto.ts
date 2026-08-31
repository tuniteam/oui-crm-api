import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsOptionalNotNull } from '@/common/decorators/optional-not-null.decorator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Wiem' })
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Bousaid' })
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ example: '0601020304', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;
}

export class ProfileCoreResponseDto {
  @ApiProperty({ example: 'cmthas5q500d85qp4nsdjto02' })
  id: string;

  @ApiProperty({ example: 'email.ouicrm+wiem@gmail.com' })
  email: string;

  @ApiProperty({ example: 'Wiem' })
  firstName: string;

  @ApiProperty({ example: 'Bousaid' })
  lastName: string;

  @ApiPropertyOptional({ example: '0601020304', nullable: true })
  phone: string | null;
}

/** Multipart file as delivered by the FileInterceptor. */
export interface UploadedFileLike {
  buffer: Buffer;
  originalname: string;
  mimetype?: string;
}
