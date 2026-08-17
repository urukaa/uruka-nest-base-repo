// src/auth/config/jwt.config.ts
import { registerAs } from '@nestjs/config';
// Via @nestjs/jwt (a declared dependency) rather than jsonwebtoken directly:
// JwtSignOptions extends jsonwebtoken's SignOptions, so the type is identical
// without importing a package this project never declared.
import type { JwtSignOptions } from '@nestjs/jwt';
import { requireEnv } from 'src/common/env';

/** `ms`-style durations accepted by jsonwebtoken, e.g. `30m`, `7d`. */
const DURATION_PATTERN = /^\d+(\.\d+)?\s*(ms|s|m|h|d|w|y)$/i;

type ExpiresIn = NonNullable<JwtSignOptions['expiresIn']>;

export default registerAs('jwt', () => {
  const secret = requireEnv('JWT_SECRET');
  const raw = requireEnv('JWT_EXPIRE_IN').trim();

  if (!raw) {
    throw new Error('JWT_EXPIRE_IN is set but empty');
  }

  // Accept a bare number (seconds) or an `ms`-style duration such as `7d`.
  let expiresIn: ExpiresIn;
  const seconds = Number(raw);

  if (Number.isFinite(seconds)) {
    if (seconds <= 0) {
      throw new Error(`JWT_EXPIRE_IN must be greater than 0, got "${raw}"`);
    }
    expiresIn = seconds;
  } else {
    if (!DURATION_PATTERN.test(raw)) {
      throw new Error(
        `JWT_EXPIRE_IN must be seconds (e.g. 86400) or a duration (e.g. 7d), got "${raw}"`,
      );
    }
    // Safe: DURATION_PATTERN is exactly the shape `ms` (and so StringValue) accepts.
    expiresIn = raw as ExpiresIn;
  }

  return { secret, signOptions: { expiresIn } };
});
