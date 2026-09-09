import { registerAs } from '@nestjs/config';
import { envList, envNumber, optionalEnv } from 'src/common/env';

/** 5 MB. Small enough that a flood of uploads cannot exhaust memory. */
const DEFAULT_MAX_UPLOAD_MB = 5;

/** Conservative default: images only. Widen deliberately, per project. */
const DEFAULT_ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

// Optional on purpose: this config is loaded globally, so requiring the values
// here would make object storage mandatory for every project cloned from this
// base. R2Service validates them on first use instead.
export default registerAs('r2', () => ({
  accessKeyId: optionalEnv('R2_ACCESS_KEY_ID', ''),
  secretAccessKey: optionalEnv('R2_SECRET_ACCESS_KEY', ''),
  endpoint: optionalEnv('R2_ENDPOINT', ''),
  bucket: optionalEnv('R2_BUCKET', ''),
  url: optionalEnv('R2_MEDIA_URL', ''),

  // Upload limits apply whether or not R2 itself is configured — they guard
  // the HTTP layer, not the storage backend.
  maxUploadBytes:
    envNumber('UPLOAD_MAX_SIZE_MB', DEFAULT_MAX_UPLOAD_MB) * 1024 * 1024,
  allowedMimeTypes: envList('UPLOAD_ALLOWED_MIME', DEFAULT_ALLOWED_MIME),
}));
