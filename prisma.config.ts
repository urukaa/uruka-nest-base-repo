import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { requireEnv } from './src/common/env';

export default defineConfig({
  datasource: {
    url: requireEnv('DATABASE_URL'),
  },
});
