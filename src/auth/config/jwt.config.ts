// src/auth/config/jwt.config.ts
import { registerAs } from '@nestjs/config';
import { requireEnv } from 'src/common/env';

export default registerAs('jwt', () => {
  const secret = requireEnv('JWT_SECRET');
  const expiresIn = Number(requireEnv('JWT_EXPIRE_IN')); // 1 hari

  if (!secret) {
    throw new Error('JWT_SECRET is not defined');
  }

  if (Number.isNaN(expiresIn)) {
    throw new Error('JWT_EXPIRE_IN must be a number (seconds)');
  }

  return {
    secret,
    expiresIn,
  };
});
