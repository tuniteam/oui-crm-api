import { ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/prisma/prisma.service';
import { AuthService } from './auth.service';

/** Pure rules of login (SPEC-09 T3 lockout, T4 status). Token issuance is covered by the curl tests. */
describe('AuthService.login', () => {
  const password = 'Periscolia2026!';
  let passwordHash: string;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    session: { create: jest.Mock; updateMany: jest.Mock; deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: AuthService;

  const baseUser = () => ({
    id: 'u1',
    email: 'u1@example.com',
    password: passwordHash,
    status: UserStatus.ACTIVE,
    failedLoginAttempts: 0,
    lockedUntil: null as Date | null,
  });

  const jwt = {
    signAsync: jest.fn().mockResolvedValue('token'),
    decode: jest.fn().mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 900 }),
  } as unknown as JwtService;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(password, 4);
  });

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({ failedLoginAttempts: 1 }) },
      session: {
        create: jest.fn().mockResolvedValue({ id: 's1', userId: 'u1', version: 0 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const config = { get: jest.fn((key: string) => ({ MAX_LOGIN_ATTEMPTS: '3', LOCKOUT_DURATION_MINUTES: '15' })[key]) };
    service = new AuthService(jwt, jwt, prisma as unknown as PrismaService, config as unknown as ConfigService);
  });

  it('401 AUTH_INVALID_CREDENTIALS for an unknown e-mail', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.login({ email: 'ghost@example.com', password })).rejects.toMatchObject({
      constructor: UnauthorizedException,
      response: { code: 'AUTH_INVALID_CREDENTIALS' },
    });
  });

  it('counts a wrong password atomically and does not lock before the threshold', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser());
    prisma.user.update.mockResolvedValueOnce({ failedLoginAttempts: 2 });
    await expect(service.login({ email: 'u1@example.com', password: 'wrong' })).rejects.toMatchObject({
      response: { code: 'AUTH_INVALID_CREDENTIALS' },
    });
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
  });

  it('locks the account when the atomic counter reaches the threshold (T3)', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser());
    prisma.user.update.mockResolvedValueOnce({ failedLoginAttempts: 3 });
    await expect(service.login({ email: 'u1@example.com', password: 'wrong' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.user.update).toHaveBeenCalledTimes(2);
    const lockData = prisma.user.update.mock.calls[1][0].data;
    expect(lockData.failedLoginAttempts).toBe(0);
    expect(lockData.lockedUntil.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);
  });

  it('423 AUTH_ACCOUNT_LOCKED while the lock is active, even with the right password', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseUser(), lockedUntil: new Date(Date.now() + 60_000) });
    const err = await service.login({ email: 'u1@example.com', password }).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(423);
    expect(err.getResponse().code).toBe('AUTH_ACCOUNT_LOCKED');
  });

  it('403 AUTH_ACCOUNT_NOT_ACTIVE for a PENDING account with the right password (T4)', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseUser(), status: UserStatus.PENDING });
    await expect(service.login({ email: 'u1@example.com', password })).rejects.toMatchObject({
      constructor: ForbiddenException,
      response: { code: 'AUTH_ACCOUNT_NOT_ACTIVE' },
    });
  });

  it('resets the counter, records the login and opens a session on success', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseUser(), failedLoginAttempts: 2 });
    const result = await service.login({ email: 'U1@example.com ', password }, '127.0.0.1');
    expect(result).toMatchObject({ accessToken: 'token', refreshToken: 'token' });
    expect(result.expiresIn).toBeGreaterThan(800);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'u1@example.com' } });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({ failedLoginAttempts: 0, lockedUntil: null, lastLoginIp: '127.0.0.1' }),
    });
    expect(prisma.session.create).toHaveBeenCalled();
    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1', version: 0 },
        data: expect.objectContaining({ version: 1 }),
      }),
    );
  });
});
