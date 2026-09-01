// ============================================
// OUI-CRM - Application-wide constants (no business value here)
// ============================================

/** Global route prefix; every URL of the API starts with it. */
export const API_PREFIX = 'api/v1';

/** Listening port when PORT is not set (.env.example uses 3001 to coexist with soft-m). */
export const DEFAULT_PORT = 3001;

/** Name of the platform when PLATFORM_NAME is not configured (e-mails, exports). */
export const DEFAULT_PLATFORM_NAME = 'OUI-CRM';

/** Swagger security scheme name used by @ApiBearerAuth() and DocumentBuilder.addBearerAuth(). */
export const SWAGGER_BEARER_AUTH = 'access-token';

export enum NodeEnv {
  DEVELOPMENT = 'development',
  TEST = 'test',
  UAT = 'uat',
  PRODUCTION = 'production',
}
export const DEFAULT_NODE_ENV = NodeEnv.DEVELOPMENT;

/** Prisma known-request error codes used in the code base. */
export const PRISMA_ERROR = {
  RECORD_NOT_FOUND: 'P2025',
  UNIQUE_VIOLATION: 'P2002',
  FOREIGN_KEY_VIOLATION: 'P2003',
} as const;

/** Application-level environment keys read outside a module's own *_ENV map. */
export const APP_ENV = {
  NODE_ENV: 'NODE_ENV',
  PORT: 'PORT',
  BASE_URL: 'BASE_URL',
  CORS_ORIGINS: 'CORS_ORIGINS',
  PLATFORM_NAME: 'PLATFORM_NAME',
} as const;
