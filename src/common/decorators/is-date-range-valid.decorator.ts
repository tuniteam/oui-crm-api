// ============================================
// OUI-CRM - IsDateRangeValid Decorator
// Validates that end date is after or equal to start date
// Requires specifying the start date property name
// ============================================

import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

export function IsDateRangeValid(
  startDateProperty: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isDateRangeValid',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [startDateProperty],
      options: {
        message:
          validationOptions?.message ||
          `${propertyName} must be equal to or after ${startDateProperty}`,
        ...validationOptions,
      },
      validator: {
        validate(value: any, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          const relatedValue = (args.object as any)[relatedPropertyName];

          // If either value is not provided, skip validation (let other validators handle required fields)
          if (!value || !relatedValue) return true;

          // Parse dates
          const startDate = new Date(relatedValue);
          const endDate = new Date(value);

          // Check if dates are valid
          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return false;

          // End date must be greater than or equal to start date
          return endDate >= startDate;
        },
      },
    });
  };
}
