import * as bcrypt from 'bcrypt';
import { apiError } from '@/common/api-error';
import { DEFAULT_BCRYPT_ROUNDS, PASSWORD_MIN_LENGTH } from '../auth.constants';

/** Policy: at least PASSWORD_MIN_LENGTH characters, one letter and one digit. */
export function isPasswordStrong(password: string): boolean {
  return (
    typeof password === 'string' &&
    password.length >= PASSWORD_MIN_LENGTH &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password)
  );
}

/** 400 PASSWORD_TOO_WEAK with the policy in `text` (SPEC-07 US-00-02). */
export function assertPasswordStrength(password: string): void {
  if (!isPasswordStrong(password)) throw apiError.badRequest('PASSWORD_TOO_WEAK', PASSWORD_MIN_LENGTH);
}

/** BCRYPT_ROUNDS from the environment (raw string), else the default. */
export function resolveBcryptRounds(raw: string | undefined): number {
  const rounds = Number(raw);
  return Number.isInteger(rounds) && rounds > 0 ? rounds : DEFAULT_BCRYPT_ROUNDS;
}

/** Shared by the API (ConfigService value) and the seeds (process.env). */
export function hashPassword(password: string, rounds: number = resolveBcryptRounds(undefined)): Promise<string> {
  return bcrypt.hash(password, rounds);
}
