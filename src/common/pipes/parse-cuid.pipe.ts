// ============================================
// OUI-CRM - ParseCuidPipe
// Validates that a route parameter is a CUID; 400 INVALID_CUID otherwise.
// ============================================

import { Injectable, PipeTransform } from '@nestjs/common';
import { isCuid } from '@paralleldrive/cuid2';
import { apiError } from '@/common/api-error';

@Injectable()
export class ParseCuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (typeof value !== 'string' || !isCuid(value)) {
      throw apiError.badRequest('INVALID_CUID', value);
    }
    return value;
  }
}
