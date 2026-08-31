import { ApiProperty } from '@nestjs/swagger';
import { FeatureCode } from '@prisma/client';
import { ArrayUnique, IsArray, IsEnum } from 'class-validator';

/** The list is the set of ENABLED features; every other feature is disabled. */
export class UpdateProjectFeaturesDto {
  @ApiProperty({ enum: FeatureCode, isArray: true, example: [FeatureCode.SALES, FeatureCode.BILLING] })
  @IsArray()
  @ArrayUnique()
  @IsEnum(FeatureCode, { each: true })
  features: FeatureCode[];
}
