import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { apiError } from '@/common/api-error';
import { JWT_EXPIRED_ERROR_NAME } from '../auth.constants';

/**
 * Bearer JWT guard. The strategy reloads the session on every request (version, expiry,
 * user status). Distinguishes an expired token (front should refresh) from any other failure.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser | false,
    info: { name?: string; message?: string } | undefined,
  ): TUser {
    if (info?.name === JWT_EXPIRED_ERROR_NAME) throw apiError.unauthorized('TOKEN_EXPIRED');
    if (err || !user) throw err ?? apiError.unauthorized('UNAUTHORIZED');
    return user;
  }
}
