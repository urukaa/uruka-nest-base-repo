import { registerAs } from '@nestjs/config';
import { optionalEnv } from 'src/common/env';

// Optional on purpose: this config is loaded globally, so requiring the values
// here would make object storage mandatory for every project cloned from this
// base. R2Service validates them on first use instead.
export default registerAs('r2', () => ({
  accessKeyId: optionalEnv('R2_ACCESS_KEY_ID', ''),
  secretAccessKey: optionalEnv('R2_SECRET_ACCESS_KEY', ''),
  endpoint: optionalEnv('R2_ENDPOINT', ''),
  bucket: optionalEnv('R2_BUCKET', ''),
  url: optionalEnv('R2_MEDIA_URL', ''),
}));
