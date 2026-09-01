// ============================================
// OUI-CRM - Typed API exceptions
// One factory per HTTP status: the error key is checked against messages.ts at compile time
// and the message arguments follow the signature of the message (string or function).
// Usage: throw apiError.notFound('PROJECT_NOT_FOUND', id);
// ============================================

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiMessages } from './messages';

const messages = ApiMessages.errors.message;

export type ErrorKey = keyof typeof messages;

type MessageArgs<K extends ErrorKey> = (typeof messages)[K] extends (...args: infer A) => string
  ? A
  : [];

/** `{ code, message }` body understood by AllExceptionsFilter. */
export function apiErrorBody<K extends ErrorKey>(
  key: K,
  ...args: MessageArgs<K>
): { code: string; message: string } {
  const definition = messages[key] as string | ((...a: unknown[]) => string);
  const message = typeof definition === 'function' ? definition(...args) : definition;
  return { code: ApiMessages.errors.code[key], message };
}

type Factory = <K extends ErrorKey>(key: K, ...args: MessageArgs<K>) => HttpException;

export const apiError: {
  badRequest: Factory;
  unauthorized: Factory;
  forbidden: Factory;
  notFound: Factory;
  conflict: Factory;
  gone: Factory;
  locked: Factory;
  internal: Factory;
} = {
  badRequest: (key, ...args) => new BadRequestException(apiErrorBody(key, ...args)),
  unauthorized: (key, ...args) => new UnauthorizedException(apiErrorBody(key, ...args)),
  forbidden: (key, ...args) => new ForbiddenException(apiErrorBody(key, ...args)),
  notFound: (key, ...args) => new NotFoundException(apiErrorBody(key, ...args)),
  conflict: (key, ...args) => new ConflictException(apiErrorBody(key, ...args)),
  gone: (key, ...args) => new GoneException(apiErrorBody(key, ...args)),
  locked: (key, ...args) => new HttpException(apiErrorBody(key, ...args), HttpStatus.LOCKED),
  internal: (key, ...args) => new InternalServerErrorException(apiErrorBody(key, ...args)),
};

/**
 * Attaches a structured `meta` object to an API error; AllExceptionsFilter forwards it as
 * `messages.meta`. Use it whenever the front needs a value the human `text` also mentions
 * (e.g. lockedUntil) — clients must never parse `text`.
 */
export function withMeta(exception: HttpException, meta: Record<string, unknown>): HttpException {
  const response = exception.getResponse() as Record<string, unknown>;
  return new HttpException({ ...response, meta }, exception.getStatus());
}

/**
 * Attaches a `details` list to an API error; AllExceptionsFilter forwards it as
 * `messages.details` (one human-readable line per issue, e.g. template validation).
 */
export function withDetails(exception: HttpException, details: string[]): HttpException {
  const response = exception.getResponse() as Record<string, unknown>;
  return new HttpException({ ...response, details }, exception.getStatus());
}
