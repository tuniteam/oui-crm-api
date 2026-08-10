// ============================================
// OUI-CRM - IsDateWithinYearCodeRange Decorator
// Validates that a date falls within the year code range
// For yearCode "2024-2025", date must be between 2024-01-01 and 2025-12-31
// ============================================

import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

export function IsDateWithinYearCodeRange(
  yearCodeProperty: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isDateWithinYearCodeRange',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [yearCodeProperty],
      options: {
        message:
          validationOptions?.message ||
          `${propertyName} must be within the year range specified in ${yearCodeProperty}`,
        ...validationOptions,
      },
      validator: {
        validate(value: any, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          const yearCodeValue = (args.object as any)[relatedPropertyName];

          // If either value is not provided, skip validation (let other validators handle required fields)
          if (!value || !yearCodeValue) return true;

          // Parse yearCode (e.g., "2024-2025")
          if (typeof yearCodeValue !== 'string') return false;
          
          const parts = yearCodeValue.split('-');
          if (parts.length !== 2) return false;

          const firstYear = parseInt(parts[0], 10);
          const secondYear = parseInt(parts[1], 10);

          if (isNaN(firstYear) || isNaN(secondYear)) return false;

          // Parse the date
          const date = new Date(value);
          if (isNaN(date.getTime())) return false;

          // Create boundaries: first year Jan 1 to second year Dec 31
          const minDate = new Date(firstYear, 0, 1); // Jan 1 of first year
          const maxDate = new Date(secondYear, 11, 31, 23, 59, 59, 999); // Dec 31 of second year

          // Check if date is within range
          return date >= minDate && date <= maxDate;
        },
      },
    });
  };
}
