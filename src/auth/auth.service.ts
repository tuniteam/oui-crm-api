import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Session, User, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { apiError } from '@/common/api-error';
import { getNumber } from '@/common/utils/config.utils';
import { MS_PER_MINUTE, MS_PER_SECOND } from '@/common/utils/date.utils';
import { normalizeEmail } from '@/common/utils/email.utils';
import { PrismaService } from '@/prisma/prisma.service';
import {
  AUTH_ENV,
  DEFAULT_LOCKOUT_DURATION_MINUTES,
  DEFAULT_MAX_LOGIN_ATTEMPTS,
  JWT_ACCESS_SERVICE,
  JWT_REFRESH_SERVICE,
  TOKEN_HASH_ROUNDS,
} from './auth.constants';
import { AuthTokensResponseDto } from './dto/auth-tokens-response.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { assertSessionLive } from './utils/session.utils';

@Injectable()
export class AuthService {
  constructor(
    @Inject(JWT_ACCESS_SERVICE) private readonly jwtAccessService: JwtService,
    @Inject(JWT_REFRESH_SERVICE) private readonly jwtRefreshService: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * US-00-01: e-mail + password → session tokens. Lockout after MAX_LOGIN_ATTEMPTS failures
   * for LOCKOUT_DURATION_MINUTES (SPEC-09 T3); only ACTIVE accounts may log in (T4).
   */
  async login(dto: LoginDto, ip?: string): Promise<AuthTokensResponseDto> {
    const now = new Date();
    const user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(dto.email) } });
    if (!user) throw apiError.unauthorized('AUTH_INVALID_CREDENTIALS');

    if (user.lockedUntil && user.lockedUntil > now) {
      throw apiError.locked('AUTH_ACCOUNT_LOCKED', user.lockedUntil.toISOString());
    }

    if (!(await bcrypt.compare(dto.password, user.password))) {
      await this.registerFailedAttempt(user, now);
      throw apiError.unauthorized('AUTH_INVALID_CREDENTIALS');
    }

    if (user.status !== UserStatus.ACTIVE) throw apiError.forbidden('AUTH_ACCOUNT_NOT_ACTIVE');

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now, lastLoginIp: ip ?? null },
      }),
      // Housekeeping: drop this user's expired sessions
      this.prisma.session.deleteMany({ where: { userId: user.id, expiresAt: { lt: now } } }),
    ]);

    return this.openSession(user.id);
  }

  /** Creates a session and issues its first token pair (login, account activation). */
  async openSession(userId: string): Promise<AuthTokensResponseDto> {
    const session = await this.prisma.session.create({
      data: { userId, refreshToken: '', expiresAt: new Date() },
    });
    return this.rotateSession(session);
  }

  /**
   * Refresh-token rotation: the session version is incremented, so the previous access and
   * refresh tokens are rejected on their next use.
   */
  async refreshToken(refreshToken: string): Promise<AuthTokensResponseDto> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtRefreshService.verifyAsync<JwtPayload>(refreshToken);
    } catch {
      throw apiError.unauthorized('REFRESH_TOKEN_INVALID_OR_EXPIRED');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: { select: { status: true } } },
    });
    assertSessionLive(session, payload.version, 'REFRESH_TOKEN_INVALID_OR_USED');

    if (!(await bcrypt.compare(refreshToken, session.refreshToken))) {
      throw apiError.unauthorized('REFRESH_TOKEN_INVALID_OR_USED');
    }

    return this.rotateSession(session);
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  // ----------------------------------------------------------------------------------------

  /** Nth failure locks the account; the counter restarts after the lock (SPEC-09 T3). */
  private async registerFailedAttempt(user: User, now: Date): Promise<void> {
    const maxAttempts = getNumber(this.config, AUTH_ENV.MAX_LOGIN_ATTEMPTS, DEFAULT_MAX_LOGIN_ATTEMPTS);
    const lockoutMinutes = getNumber(
      this.config,
      AUTH_ENV.LOCKOUT_DURATION_MINUTES,
      DEFAULT_LOCKOUT_DURATION_MINUTES,
    );
    const attempts = user.failedLoginAttempts + 1;
    const locked = attempts >= maxAttempts;

    await this.prisma.user.update({
      where: { id: user.id },
      data: locked
        ? { failedLoginAttempts: 0, lockedUntil: new Date(now.getTime() + lockoutMinutes * MS_PER_MINUTE) }
        : { failedLoginAttempts: attempts },
    });
  }

  /**
   * Issues a new token pair for the session: version + 1, refresh token hashed in the
   * session row, session expiry aligned on the refresh token expiry.
   */
  private async rotateSession(session: Session): Promise<AuthTokensResponseDto> {
    const version = session.version + 1;
    const payload: JwtPayload = { userId: session.userId, sessionId: session.id, version };

    const refreshToken = await this.jwtRefreshService.signAsync(payload);
    const { exp: refreshExp } = this.jwtRefreshService.decode(refreshToken) as { exp: number };

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshToken: await bcrypt.hash(refreshToken, TOKEN_HASH_ROUNDS),
        expiresAt: new Date(refreshExp * MS_PER_SECOND),
        version,
      },
    });

    const accessToken = await this.jwtAccessService.signAsync(payload);
    const { exp: accessExp } = this.jwtAccessService.decode(accessToken) as { exp: number };

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExp - Math.floor(Date.now() / MS_PER_SECOND),
    };
  }
}
