import { registerAs } from '@nestjs/config';
import { requireEnv } from 'src/common/env';

export default registerAs('r2', () => ({
  accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
  secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
  endpoint: requireEnv('R2_ENDPOINT'),
  bucket: requireEnv('R2_BUCKET'),
  url: requireEnv('R2_MEDIA_URL'),
}));
