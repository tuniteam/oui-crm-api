// ============================================
// OUI-CRM - One-time e-mailed tokens (activation, password reset, e-mail change)
// Shared mechanics: JWT signed with a dedicated secret, encrypted with cryptr for the link,
// SHA-256 + bcrypt digest stored in the database (the SHA-256 step avoids the 72-byte
// truncation of bcrypt). The three flows only differ by their table and their error codes.
// ============================================

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as Cryptr from 'cryptr';
import { createHash } from 'crypto';
import { apiError } from '@/common/api-error';
import { PrismaService } from '@/prisma/prisma.service';
import {
  AUTH_ENV,
  FRONT_TOKEN_QUERY_PARAM,
  JWT_EXPIRED_ERROR_NAME,
  TOKEN_HASH_ROUNDS,
  TokenFlow,
} from '../auth.constants';

/** Builds the cryptr instance of a flow; a missing secret is a configuration error (500). */
export function createCryptr(config: ConfigService, flow: TokenFlow): Cryptr {
  const secret = config.get<string>(flow.cryptrSecretKey);
  if (!secret) throw apiError.internal(flow.missingSecretCode);
  return new Cryptr(secret);
}

export function hashJwt(jwt: string): string {
  return createHash('sha256').update(jwt).digest('hex');
}

export interface IssuedToken {
  /** Value sent in the e-mail link. */
  encrypted: string;
  /** bcrypt(sha256(jwt)) to persist. */
  tokenHash: string;
  expiresAt: Date;
}

/** Signs a JWT, encrypts it for the link and prepares the digest to store. */
export async function issueToken(
  jwtService: JwtService,
  cryptr: Cryptr,
  payload: Record<string, unknown>,
): Promise<IssuedToken> {
  const jwt = await jwtService.signAsync(payload);
  const { exp } = jwtService.decode(jwt) as { exp: number };
  return {
    encrypted: cryptr.encrypt(jwt),
    tokenHash: await bcrypt.hash(hashJwt(jwt), TOKEN_HASH_ROUNDS),
    expiresAt: new Date(exp * 1000),
  };
}

/** Shape shared by ActivationToken, PasswordResetToken and EmailChangeToken delegates. */
export interface TokenRecord {
  tokenHash: string;
  expiresAt: Date;
}
export interface TokenDelegate<R extends TokenRecord, Extra extends object = object> {
  findFirst(args: { where: { userId: string }; orderBy: { createdAt: 'desc' } }): Promise<R | null>;
  deleteMany(args: { where: { userId: string } }): Prisma.PrismaPromise<unknown>;
  create(args: { data: { userId: string; tokenHash: string; expiresAt: Date } & Extra }): Prisma.PrismaPromise<unknown>;
}

/** Replaces the user's previous token by the new one (one live token per user and flow). */
export function storeIssuedToken<R extends TokenRecord, Extra extends object>(
  prisma: PrismaService,
  delegate: TokenDelegate<R, Extra>,
  userId: string,
  issued: IssuedToken,
  extra: Extra = {} as Extra,
): Promise<unknown[]> {
  return prisma.$transaction([
    delegate.deleteMany({ where: { userId } }),
    delegate.create({ data: { userId, tokenHash: issued.tokenHash, expiresAt: issued.expiresAt, ...extra } }),
  ]);
}

export type TokenVerdict = 'VALID' | 'EXPIRED' | 'INVALID';

/**
 * Compares the JWT with the stored digest, then verifies signature and expiry.
 * The database expiry is a safety net: the JWT `exp` is the primary guard.
 */
export async function verifyToken(
  jwtService: JwtService,
  jwt: string,
  record: TokenRecord | null,
  now: Date = new Date(),
): Promise<TokenVerdict> {
  if (!record) return 'INVALID';
  if (!(await bcrypt.compare(hashJwt(jwt), record.tokenHash))) return 'INVALID';
  if (record.expiresAt <= now) return 'EXPIRED';
  try {
    await jwtService.verifyAsync(jwt);
    return 'VALID';
  } catch (err) {
    return (err as { name?: string })?.name === JWT_EXPIRED_ERROR_NAME ? 'EXPIRED' : 'INVALID';
  }
}

export interface ResolvedToken<R extends TokenRecord> {
  verdict: TokenVerdict;
  /** Present when the token could be decrypted and its user exists. */
  user: User | null;
  record: R | null;
}

/**
 * Link token → user + verdict, common to the three flows:
 * decrypt → read userId → load the user → check eligibility → compare with the latest record.
 * The caller maps the verdict to its own error codes.
 */
export async function resolveToken<R extends TokenRecord>(params: {
  prisma: PrismaService;
  jwtService: JwtService;
  cryptr: Cryptr;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delegate: TokenDelegate<R, any>;
  token: string;
  isEligible: (user: User) => boolean;
}): Promise<ResolvedToken<R>> {
  const { prisma, jwtService, cryptr, delegate, token, isEligible } = params;
  const invalid: ResolvedToken<R> = { verdict: 'INVALID', user: null, record: null };

  let jwt: string;
  try {
    jwt = token?.trim() ? cryptr.decrypt(token) : '';
  } catch {
    return invalid;
  }
  if (!jwt) return invalid;

  const payload = jwtService.decode(jwt) as { userId?: string } | null;
  if (!payload?.userId) return invalid;

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || !isEligible(user)) return invalid;

  const record = await delegate.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
  return { verdict: await verifyToken(jwtService, jwt, record), user, record };
}

/** Link to the flow's front page carrying the token (FRONT_URL). */
export function buildFrontLink(config: ConfigService, flow: TokenFlow, token: string): string {
  const base = (config.get<string>(AUTH_ENV.FRONT_URL) || '').replace(/\/$/, '');
  return `${base}${flow.frontRoute}?${FRONT_TOKEN_QUERY_PARAM}=${encodeURIComponent(token)}`;
}
