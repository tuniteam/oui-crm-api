import { ConfigService } from '@nestjs/config';

/** Numeric environment value with a fallback; an unparsable value falls back too. */
export function getNumber(config: ConfigService, key: string, fallback: number): number {
  const raw = config.get<string>(key);
  const value = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** Boolean environment value: only the literal string 'true' is true. */
export function getBoolean(config: ConfigService, key: string, fallback = false): boolean {
  const raw = config.get<string>(key);
  return raw === undefined || raw === '' ? fallback : raw === 'true';
}
