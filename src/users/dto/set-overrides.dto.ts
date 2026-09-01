import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString } from 'class-validator';

/** Replaces the whole override set for this user on this project (idempotent). */
export class SetOverridesDto {
  @ApiProperty({ type: [String], example: ['quotes:validate'], description: 'Permissions granted on top of the role' })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  added: string[];

  @ApiProperty({ type: [String], example: ['organizations:export'], description: 'Permissions removed from the role (removal wins)' })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  removed: string[];
}
