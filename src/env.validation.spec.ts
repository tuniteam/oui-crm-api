import { validateEnv } from './env.validation';

/** SPEC-20 — l'API refuse de démarrer quand une clé dont l'absence ne se voit pas manque. */
describe('validateEnv', () => {
  const secrets = {
    ACTIVATION_TOKEN_SECRET: 's',
    ACTIVATION_CRYPTR_SECRET: 's',
    PASSWORD_RESET_TOKEN_SECRET: 's',
    PASSWORD_RESET_CRYPTR_SECRET: 's',
    EMAIL_CHANGE_TOKEN_SECRET: 's',
    EMAIL_CHANGE_CRYPTR_SECRET: 's',
    PRESIGNED_PUBLIC_URL: 'http://localhost:9000',
  };

  it('laisse démarrer le développement sans CORS ni lien de front', () => {
    expect(validateEnv({ ...secrets, NODE_ENV: 'development' })).toBeDefined();
  });

  it('exige CORS_ORIGINS et FRONT_URL hors développement, en les nommant', () => {
    expect(() => validateEnv({ ...secrets, NODE_ENV: 'production' })).toThrow('CORS_ORIGINS, FRONT_URL');
  });

  it('traite une valeur vide comme absente', () => {
    expect(() => validateEnv({ ...secrets, ACTIVATION_TOKEN_SECRET: '  ' })).toThrow('ACTIVATION_TOKEN_SECRET');
  });

  it('nomme toutes les clés manquantes en une fois', () => {
    expect(() => validateEnv({ NODE_ENV: 'uat' })).toThrow(/ACTIVATION_TOKEN_SECRET.*PRESIGNED_PUBLIC_URL.*CORS_ORIGINS.*FRONT_URL/);
  });
});
