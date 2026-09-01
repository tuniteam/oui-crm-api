import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { ROLE_CODE_MAX_LENGTH, ROLE_CODE_PATTERN, ROLE_LABEL_MAX_LENGTH } from '../roles.constants';

export class DuplicateRoleDto {
  @ApiProperty({ example: 'SALES_REP_SENIOR', description: 'Uppercase snake case, unique in the project' })
  @IsString()
  @MaxLength(ROLE_CODE_MAX_LENGTH)
  @Matches(ROLE_CODE_PATTERN)
  code: string;

  @ApiProperty({ example: 'Commercial senior' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(ROLE_LABEL_MAX_LENGTH)
  label: string;
}

export class DuplicateRoleResponseDto {
  @ApiProperty({ example: 'cmth…' })
  id: string;

  @ApiProperty({ example: 'SALES_REP_SENIOR' })
  code: string;
}
