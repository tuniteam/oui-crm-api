import { AUTH_ENV, TOKEN_FLOWS } from '@/auth/auth.constants';
import { APP_ENV, DEFAULT_NODE_ENV, NodeEnv } from '@/common/constants/app.constants';
import { ApiMessages } from '@/common/messages';
import { STORAGE_ENV } from '@/storage/storage.constants';

/**
 * SPEC-20 — ce sans quoi l'API refuse de démarrer. Seulement les clés dont l'absence **ne se voit
 * pas** au démarrage : la base, les secrets JWT, le bucket et l'expéditeur des e-mails échouent déjà
 * d'eux-mêmes, bruyamment, et n'ont pas à être listés une seconde fois.
 */
const REQUIRED = [
  // Lus à l'usage : l'absence éclatait au premier e-mail d'activation, pas au démarrage.
  ...Object.values(TOKEN_FLOWS).flatMap((flow) => [flow.jwtSecretKey, flow.cryptrSecretKey]),
  // Lu au premier téléchargement d'un fichier.
  STORAGE_ENV.PRESIGNED_PUBLIC_URL,
];

/**
 * Hors développement, l'API démarre sans elles — mais refuse toutes les requêtes du front, ou
 * envoie des e-mails dont les liens sont relatifs, donc morts.
 */
const REQUIRED_OUTSIDE_DEVELOPMENT = [APP_ENV.CORS_ORIGINS, AUTH_ENV.FRONT_URL];

/** Branché sur `ConfigModule.forRoot({ validate })` : un seul message, toutes les clés manquantes. */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const env = (config[APP_ENV.NODE_ENV] as string | undefined) ?? DEFAULT_NODE_ENV;
  const required = env === NodeEnv.DEVELOPMENT ? REQUIRED : [...REQUIRED, ...REQUIRED_OUTSIDE_DEVELOPMENT];
  const missing = required.filter((key) => !String(config[key] ?? '').trim());
  if (missing.length) throw new Error(ApiMessages.errors.message.CONFIG_MISSING(missing.join(', ')));
  return config;
}
