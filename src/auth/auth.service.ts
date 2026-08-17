import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider, Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { PrismaService } from 'src/common/prisma.service';
import { ValidationService } from 'src/common/validation.service';
import jwtConfig from './config/jwt.config';
import { AuthValidation } from './auth.validation';
import { AuthJwtPayload } from './types/auth.jwtPayload';

const BCRYPT_ROUNDS = 10;

/**
 * Compared against when a username does not exist, so a missing account costs
 * the same ~65ms as a wrong password. Without it, response time alone reveals
 * which usernames are registered.
 */
const DUMMY_HASH =
  '$2b$10$cVorbaY65ZJcF8hagQEnLO/iGQSCpcCYp8AU4xGbInsP2G8i1XrMy';

/** Never select the password column into anything that can reach a response. */
const publicUser = {
  id: true,
  username: true,
  name: true,
  role: true,
  avatar: true,
  provider: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUser }>;

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type AuthResponse = TokenPair & { user: PublicUser };

@Injectable()
export class AuthService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly prisma: PrismaService,
    private readonly validation: ValidationService,
    private readonly jwt: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly config: ConfigType<typeof jwtConfig>,
  ) {}

  async register(request: unknown): Promise<AuthResponse> {
    const dto = this.validation.validate(AuthValidation.REGISTER, request);

    const taken = await this.prisma.user.count({
      where: { username: dto.username },
    });

    if (taken) {
      throw new ConflictException('Username is already taken.');
    }

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        name: dto.name,
        password: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        provider: AuthProvider.LOCAL,
      },
      select: publicUser,
    });

    return {
      user,
      ...(await this.issueTokens(user.id, user.username, user.role)),
    };
  }

  async login(request: unknown): Promise<AuthResponse> {
    const dto = this.validation.validate(AuthValidation.LOGIN, request);

    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      select: { ...publicUser, password: true },
    });

    // Always run a comparison, even with no user and even for provider-backed
    // accounts, so every failure path takes the same time and returns the same
    // message. Anything more specific is a username-enumeration oracle.
    const matches = await bcrypt.compare(
      dto.password,
      user?.password ?? DUMMY_HASH,
    );

    if (!user || !user.password || !matches) {
      this.logger.warn({
        message: 'Failed login',
        username: dto.username,
        reason: !user
          ? 'unknown user'
          : !user.password
            ? `account uses ${user.provider}`
            : 'wrong password',
      });

      throw new UnauthorizedException('Invalid username or password.');
    }

    const { password: _discarded, ...publicFields } = user;

    return {
      user: publicFields,
      ...(await this.issueTokens(user.id, user.username, user.role)),
    };
  }

  /**
   * Seam for external providers. Whoever verifies a Clerk/Google token calls
   * this, then issueTokens — the rest of the app only ever sees our own JWT.
   */
  async linkExternalUser(params: {
    provider: AuthProvider;
    externalId: string;
    username: string;
    name?: string;
    avatar?: string;
  }): Promise<PublicUser> {
    return this.prisma.user.upsert({
      where: { externalId: params.externalId },
      create: {
        externalId: params.externalId,
        provider: params.provider,
        username: params.username,
        name: params.name,
        avatar: params.avatar,
      },
      // Identity fields are owned by the provider, so they are refreshed on
      // every login. `role` deliberately is not — that is ours to manage.
      update: {
        username: params.username,
        name: params.name,
        avatar: params.avatar,
      },
      select: publicUser,
    });
  }

  /**
   * Rotates a refresh token: the presented one is spent, a fresh pair is
   * issued, and the two are chained so a replay can be spotted later.
   */
  async refresh(request: unknown): Promise<AuthResponse> {
    const dto = this.validation.validate(AuthValidation.REFRESH, request);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: AuthService.hashRefreshToken(dto.refreshToken) },
      include: { user: { select: publicUser } },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    // Already rotated, yet someone still holds it — the only explanation is a
    // captured copy. Which of the two parties is the thief is unknowable, so
    // every session for this user is torn down and both must log in again.
    if (stored.revokedAt) {
      await this.revokeAllForUser(stored.userId);

      this.logger.error({
        message: 'Refresh token reuse detected — all sessions revoked',
        userId: stored.userId,
        tokenId: stored.id,
      });

      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (stored.expiresAt <= new Date()) {
      throw new UnauthorizedException('Refresh token expired.');
    }

    // Conditional, not a plain update: two requests can arrive with the same
    // token, and only one may win. A count of 0 means the other already spent
    // it, so this caller gets nothing rather than a second valid pair.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (claimed.count !== 1) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const issued = await this.createRefreshToken(stored.user.id);

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { replacedById: issued.id },
    });

    return {
      user: stored.user,
      accessToken: this.signAccessToken(stored.user),
      refreshToken: issued.token,
    };
  }

  /** Ends one session. Deliberately silent about whether the token existed. */
  async logout(request: unknown): Promise<void> {
    const dto = this.validation.validate(AuthValidation.REFRESH, request);

    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: AuthService.hashRefreshToken(dto.refreshToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  /** Ends every session for a user — password change, or a suspected theft. */
  async revokeAllForUser(userId: number): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async issueTokens(
    userId: number,
    username: string,
    role: User['role'],
  ): Promise<TokenPair> {
    const { token } = await this.createRefreshToken(userId);

    return {
      accessToken: this.signAccessToken({ id: userId, username, role }),
      refreshToken: token,
    };
  }

  private signAccessToken(user: {
    id: number;
    username: string;
    role: User['role'];
  }): string {
    const payload: AuthJwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    return this.jwt.sign(payload);
  }

  private async createRefreshToken(
    userId: number,
  ): Promise<{ token: string; id: string }> {
    // Opaque random string, not a JWT: this token's authority comes from the
    // database row, so there is nothing to encode and nothing to verify offline.
    const token = crypto.randomBytes(32).toString('hex');

    const row = await this.prisma.refreshToken.create({
      data: {
        tokenHash: AuthService.hashRefreshToken(token),
        userId,
        expiresAt: new Date(
          Date.now() + this.config.refreshExpiresInSeconds * 1000,
        ),
      },
      select: { id: true },
    });

    return { token, id: row.id };
  }

  /** SHA-256, not bcrypt: the input is already 256 bits of entropy, so a slow
   * hash buys nothing and would cost a lot on every refresh. */
  static hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
