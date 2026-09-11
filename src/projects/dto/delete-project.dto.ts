import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PROJECT_NAME_MAX_LENGTH } from '../projects.constants';

export class DeleteProjectDto {
  @ApiProperty({ example: 'Périscolia', description: 'Exact name of the project, as confirmation' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PROJECT_NAME_MAX_LENGTH)
  name: string;
}
