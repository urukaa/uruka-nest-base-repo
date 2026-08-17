import { z } from 'zod';

/**
 * bcrypt silently truncates input past 72 *bytes*, so two long passwords that
 * share a prefix would authenticate each other. The limit is checked in bytes
 * rather than characters because multi-byte input reaches it far sooner.
 */
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, {
    message: 'Password must be at most 72 bytes',
  });

export class AuthValidation {
  static readonly REGISTER = z.object({
    username: z.string().trim().min(3).max(100),
    password,
    name: z.string().trim().max(100).optional(),
  });

  // Deliberately lax: length rules belong on registration. Enforcing them here
  // would reject legacy passwords and hint at the current policy.
  static readonly LOGIN = z.object({
    username: z.string().trim().min(1),
    password: z.string().min(1),
  });

  static readonly REFRESH = z.object({
    refreshToken: z.string().min(1),
  });
}

export type RegisterRequest = z.infer<typeof AuthValidation.REGISTER>;
export type LoginRequest = z.infer<typeof AuthValidation.LOGIN>;
export type RefreshRequest = z.infer<typeof AuthValidation.REFRESH>;
