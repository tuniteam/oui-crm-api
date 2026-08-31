import { ValidateIf, ValidationOptions } from 'class-validator';

/**
 * Field that may be OMITTED but never null (non-nullable column): unlike @IsOptional(),
 * an explicit null still goes through the other validators and fails with 400 INVALID_DATA
 * instead of reaching Prisma and blowing up in a 500.
 */
export function IsOptionalNotNull(options?: ValidationOptions) {
  return ValidateIf((_object, value) => value !== undefined, options);
}
