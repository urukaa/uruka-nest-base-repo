/**
 * Baseline environment for the test suite so it runs on a fresh clone with no
 * .env present. Only fills gaps, except for the testing toggle which is forced
 * on so a developer's local value cannot change what the suite exercises.
 */
const defaults: Record<string, string> = {
  IS_VO1D_PRODUCTION: 'mboten',
  APP_KEY: 'test-app-key',
  APP_SECRET: 'test-app-secret',
  APP_NAME: 'test-app',
  PORT: '8000',
  ORIGINS: 'http://127.0.0.1:3000',
  DATABASE_URL:
    'postgresql://postgres:postgres@localhost:5432/test?schema=public',
  JWT_SECRET: 'test-jwt-secret-not-for-production',
  JWT_EXPIRE_IN: '3600',
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

process.env.IS_VO1D_TESTING = 'nggih';
