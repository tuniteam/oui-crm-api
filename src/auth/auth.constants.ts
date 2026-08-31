// ============================================
// OUI-CRM - Auth constants: DI tokens, environment keys, defaults, token flows
// ============================================

import { ErrorKey } from '@/common/api-error';
import { MS_PER_MINUTE } from '@/common/utils/date.utils';

/** Environment keys read by the auth module (single place, see .env.example). */
export const AUTH_ENV = {
  JWT_ACCESS_SECRET: 'JWT_ACCESS_SECRET',
  JWT_ACCESS_EXPIRATION: 'JWT_ACCESS_EXPIRATION',
  JWT_REFRESH_SECRET: 'JWT_REFRESH_SECRET',
  JWT_REFRESH_EXPIRATION: 'JWT_REFRESH_EXPIRATION',
  MAX_LOGIN_ATTEMPTS: 'MAX_LOGIN_ATTEMPTS',
  LOCKOUT_DURATION_MINUTES: 'LOCKOUT_DURATION_MINUTES',
  BCRYPT_ROUNDS: 'BCRYPT_ROUNDS',
  FRONT_URL: 'FRONT_URL',
  AUTH_RATE_LIMIT_MAX: 'AUTH_RATE_LIMIT_MAX',
} as const;

/** Injection tokens of the JwtService instances (auth.module.ts). */
export const JWT_ACCESS_SERVICE = 'JWT_ACCESS_SERVICE';
export const JWT_REFRESH_SERVICE = 'JWT_REFRESH_SERVICE';

/** Fallbacks when the .env value is missing. */
export const DEFAULT_ACCESS_EXPIRATION = '15m';
export const DEFAULT_REFRESH_EXPIRATION = '7d';
export const DEFAULT_MAX_LOGIN_ATTEMPTS = 5;
export const DEFAULT_LOCKOUT_DURATION_MINUTES = 15;
export const DEFAULT_BCRYPT_ROUNDS = 12;

/** Rate limit on /auth routes (express-rate-limit): window and default max requests per IP. */
export const AUTH_RATE_LIMIT_WINDOW_MS = 15 * MS_PER_MINUTE;
export const DEFAULT_AUTH_RATE_LIMIT_MAX = 50;

/** bcrypt cost for opaque tokens (refresh / activation / reset). Lower than passwords: high entropy input. */
export const TOKEN_HASH_ROUNDS = 10;

/** Password policy (messages.ts PASSWORD_TOO_WEAK describes it to the user). */
export const PASSWORD_MIN_LENGTH = 10;

/** Request header carrying the current project (SPEC-02 §4.1). */
export const PROJECT_ID_HEADER = 'x-project-id';

/** Query parameter carrying an e-mailed token on the front pages. */
export const FRONT_TOKEN_QUERY_PARAM = 'token';

/** Name of the error thrown by jsonwebtoken when `exp` is in the past. */
export const JWT_EXPIRED_ERROR_NAME = 'TokenExpiredError';

/**
 * One-time e-mailed token flows (activation, password reset, e-mail change): each one has its
 * own JWT secret and lifetime, its own cryptr secret, its DI token and its front page.
 */
export interface TokenFlow {
  diToken: string;
  jwtSecretKey: string;
  expirationKey: string;
  defaultExpiration: string;
  cryptrSecretKey: string;
  missingSecretCode: ErrorKey;
  /** Front page receiving `?token=` (SPEC-07 US-00-02 handoff). */
  frontRoute: string;
}

export const TOKEN_FLOWS = {
  activation: {
    diToken: 'JWT_ACTIVATION_SERVICE',
    jwtSecretKey: 'ACTIVATION_TOKEN_SECRET',
    expirationKey: 'ACTIVATION_TOKEN_EXPIRATION',
    defaultExpiration: '72h',
    cryptrSecretKey: 'ACTIVATION_CRYPTR_SECRET',
    missingSecretCode: 'ACTIVATION_TOKEN_SECRET_MISSING',
    frontRoute: '/activate',
  },
  passwordReset: {
    diToken: 'JWT_PASSWORD_RESET_SERVICE',
    jwtSecretKey: 'PASSWORD_RESET_TOKEN_SECRET',
    expirationKey: 'PASSWORD_RESET_TOKEN_EXPIRATION',
    defaultExpiration: '30m',
    cryptrSecretKey: 'PASSWORD_RESET_CRYPTR_SECRET',
    missingSecretCode: 'PASSWORD_RESET_TOKEN_SECRET_MISSING',
    frontRoute: '/reset',
  },
  emailChange: {
    diToken: 'JWT_EMAIL_CHANGE_SERVICE',
    jwtSecretKey: 'EMAIL_CHANGE_TOKEN_SECRET',
    expirationKey: 'EMAIL_CHANGE_TOKEN_EXPIRATION',
    defaultExpiration: '30m',
    cryptrSecretKey: 'EMAIL_CHANGE_CRYPTR_SECRET',
    missingSecretCode: 'EMAIL_CHANGE_TOKEN_SECRET_MISSING',
    frontRoute: '/email-change',
  },
} as const satisfies Record<string, TokenFlow>;

/** Bearer scheme registered in Swagger under SWAGGER_BEARER_AUTH (app.constants). */
export const SWAGGER_BEARER_AUTH_SCHEME = {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
} as const;
