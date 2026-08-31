import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Documents a route that intentionally has no JwtAuthGuard (login, activation…). Guards are
 * explicit per route (no APP_GUARD), so this is a marker for reviews and Swagger, not a bypass.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
