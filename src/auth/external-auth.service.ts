import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import externalAuthConfig from './config/external-auth.config';

export type ExternalIdentity = {
  externalId: string;
  username: string;
  name?: string;
};

@Injectable()
export class ExternalAuthService {
  /**
   * Built once and reused: jose caches the fetched keys and handles rotation,
   * so verification does not reach the provider on every request. Creating a
   * new set per call would put a network round-trip in the login path.
   */
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    @Inject(externalAuthConfig.KEY)
    private readonly config: ConfigType<typeof externalAuthConfig>,
  ) {}

  /** Configuration presence is the on/off switch — there is no separate flag. */
  isEnabled(): boolean {
    return Boolean(this.config.jwksUrl && this.config.issuer);
  }

  /** Which AuthProvider value provisioned users are stored under. */
  get providerName() {
    return this.config.provider;
  }

  async verify(token: string): Promise<ExternalIdentity> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'External authentication is not configured.',
      );
    }

    this.jwks ??= createRemoteJWKSet(new URL(this.config.jwksUrl));

    let payload: JWTPayload;

    try {
      ({ payload } = await jwtVerify(token, this.jwks, {
        issuer: this.config.issuer,
        algorithms: ['RS256'],
        ...(this.config.audience ? { audience: this.config.audience } : {}),
      }));
    } catch (error) {
      this.logger.warn({
        message: 'External token rejected',
        error: error instanceof Error ? error.message : error,
      });

      throw new UnauthorizedException('Invalid external token.');
    }

    this.assertAuthorizedParty(payload);

    return this.toIdentity(payload);
  }

  /**
   * `azp` names the origin the token was minted for. Skipping this check is
   * what lets a token issued for someone else's site be replayed against ours,
   * which is why Clerk documents it as a CSRF exposure rather than an option.
   */
  private assertAuthorizedParty(payload: JWTPayload): void {
    const allowed = this.config.authorizedParties;
    if (!allowed.length) return;

    const azp = typeof payload.azp === 'string' ? payload.azp : undefined;

    if (!azp || !allowed.includes(azp)) {
      this.logger.warn({
        message: 'External token rejected: unauthorized party',
        azp: azp ?? '(missing)',
      });

      throw new UnauthorizedException('Invalid external token.');
    }
  }

  private toIdentity(payload: JWTPayload): ExternalIdentity {
    const externalId = payload.sub;
    const username = payload[this.config.usernameClaim];
    const name = payload[this.config.nameClaim];

    if (typeof externalId !== 'string' || !externalId) {
      throw new UnauthorizedException('External token has no subject.');
    }

    // Refusing here rather than falling back to `sub` on purpose: a silent
    // fallback fills the table with users named `user_2abc...` and the mistake
    // only surfaces months later.
    if (typeof username !== 'string' || !username) {
      this.logger.error({
        message: `External token is missing the "${this.config.usernameClaim}" claim`,
        hint: 'Clerk needs a JWT template for anything beyond `sub`.',
      });

      throw new UnauthorizedException(
        `External token is missing the "${this.config.usernameClaim}" claim.`,
      );
    }

    return {
      externalId,
      username,
      name: typeof name === 'string' ? name : undefined,
    };
  }
}
