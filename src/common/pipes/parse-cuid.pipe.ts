// ============================================
// OUI-CRM - ParseCuidPipe
// Validates CUID format for route parameters
// ============================================

import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { isCuid } from '@paralleldrive/cuid2';
import { ApiMessages } from '../messages';

@Injectable()
export class ParseCuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isCuid(value)) {
      throw new BadRequestException({
        code: ApiMessages.errors.code.INVALID_CUID,
        message: ApiMessages.errors.message.INVALID_CUID(value),
      });
    }
    return value;
  }
}
