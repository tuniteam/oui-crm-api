// ============================================
// OUI-CRM - IsCuid Decorator
// Validates CUID format for DTO properties
// Supports { each: true } for array validation
// ============================================

import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { isCuid } from '@paralleldrive/cuid2';

export function IsCuid(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCuid',
      target: object.constructor,
      propertyName: propertyName,
      options: {
        message: validationOptions?.each
          ? `each value in ${propertyName} must be a valid CUID`
          : `${propertyName} must be a valid CUID`,
        ...validationOptions,
      },
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (validationOptions?.each && Array.isArray(value)) {
            return value.every((item) => typeof item === 'string' && isCuid(item));
          }
          return typeof value === 'string' && isCuid(value);
        },
      },
    });
  };
}
