import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Verifies the Bearer token via JwtStrategy.
 *
 * If you add token revocation later, override `canActivate`, call
 * `super.canActivate(context)` first, then check the raw token against your
 * blacklist store. The `tokenBlacklist` model does not exist in the schema yet.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
