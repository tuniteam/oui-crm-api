// ============================================
// OUI-CRM - IsYearCodeIncrement Decorator
// Validates that yearCode follows YYYY-YYYY format
// where second year is first year + 1
// ============================================

import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

export function IsYearCodeIncrement(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isYearCodeIncrement',
      target: object.constructor,
      propertyName: propertyName,
      options: {
        message: validationOptions?.message || 'Year code must be in format YYYY-(YYYY+1)',
        ...validationOptions,
      },
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          
          const parts = value.split('-');
          if (parts.length !== 2) return false;
          
          const firstYear = parseInt(parts[0], 10);
          const secondYear = parseInt(parts[1], 10);
          
          if (isNaN(firstYear) || isNaN(secondYear)) return false;
          
          return secondYear - firstYear === 1;
        },
      },
    });
  };
}
