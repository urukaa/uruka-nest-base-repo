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

  async issueTokens(
    userId: number,
    username: string,
    role: User['role'],
  ): Promise<TokenPair> {
    const payload: AuthJwtPayload = { sub: userId, username, role };
    const accessToken = this.jwt.sign(payload);

    // Opaque random string, not a JWT: this token's authority comes from the
    // database row, so there is nothing to encode and nothing to verify offline.
    const refreshToken = crypto.randomBytes(32).toString('hex');

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: AuthService.hashRefreshToken(refreshToken),
        userId,
        expiresAt: new Date(
          Date.now() + this.config.refreshExpiresInSeconds * 1000,
        ),
      },
    });

    return { accessToken, refreshToken };
  }

  /** SHA-256, not bcrypt: the input is already 256 bits of entropy, so a slow
   * hash buys nothing and would cost a lot on every refresh. */
  static hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
