// ============================================
// OUI-CRM - IsCuid Decorator
// Validates CUID format for DTO properties (supports { each: true } for arrays)
// ============================================

import { registerDecorator, ValidationOptions } from 'class-validator';
import { isCuid } from '@paralleldrive/cuid2';
import { ApiMessages } from '../messages';

export function IsCuid(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCuid',
      target: object.constructor,
      propertyName,
      options: {
        message: ApiMessages.errors.message.INVALID_CUID_FIELD(propertyName, !!validationOptions?.each),
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          if (validationOptions?.each && Array.isArray(value)) {
            return value.every((item) => typeof item === 'string' && isCuid(item));
          }
          return typeof value === 'string' && isCuid(value);
        },
      },
    });
  };
}
