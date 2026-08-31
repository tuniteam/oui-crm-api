import { Session, UserStatus } from '@prisma/client';
import { apiError, ErrorKey } from '@/common/api-error';

/**
 * A session is usable when it exists, its version matches the token's and it has not expired;
 * the account behind it must still be ACTIVE (SPEC-09 T4). Shared by JwtStrategy (every
 * request) and AuthService.refreshToken.
 */
export function assertSessionLive(
  session: (Session & { user: { status: UserStatus } }) | null,
  payloadVersion: number,
  // Rotation (refresh): a stale version means the token was already used
  staleKey: ErrorKey = 'UNAUTHORIZED',
  now: Date = new Date(),
): asserts session is Session & { user: { status: UserStatus } } {
  if (!session) throw apiError.unauthorized('SESSION_NOT_FOUND');
  if (payloadVersion !== session.version || session.expiresAt < now) {
    throw apiError.unauthorized(staleKey);
  }
  if (session.user.status !== UserStatus.ACTIVE) {
    throw apiError.unauthorized('AUTH_ACCOUNT_NOT_ACTIVE');
  }
}
