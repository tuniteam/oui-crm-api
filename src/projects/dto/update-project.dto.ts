import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PROJECT_DESCRIPTION_MAX_LENGTH, PROJECT_NAME_MAX_LENGTH } from '../projects.constants';

/** The slug is immutable (URLs, export file names). */
export class UpdateProjectDto {
  @ApiPropertyOptional({ example: 'Périscolia' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(PROJECT_NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional({ example: 'Périscolia — gestion périscolaire' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(PROJECT_NAME_MAX_LENGTH)
  productName?: string;

  @ApiPropertyOptional({ example: 'Logiciel de gestion périscolaire vendu aux collectivités.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(PROJECT_DESCRIPTION_MAX_LENGTH)
  description?: string | null;
}
