import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { ExternalAuthService } from './external-auth.service';
import { AuthValidation } from './auth.validation';
import { JwtAuthGuard } from './guards/jwt-auth/jwt-auth.guard';
import { ValidationService } from 'src/common/validation.service';
import {
  ExternalSessionReq,
  LoginUserReq,
  RefreshTokenReq,
  RegisterUserReq,
} from 'src/model/user.model';
import { AuthenticatedUser } from './types/auth.jwtPayload';

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly externalAuth: ExternalAuthService,
    private readonly validation: ValidationService,
  ) {}

  @Post('register')
  @HttpCode(201)
  @ApiBody({ type: RegisterUserReq })
  register(@Body() body: unknown) {
    return this.authService.register(body);
  }

  // Tighter than the global 100/min, but not by much: the throttler keys on IP,
  // and behind a BFF every user shares one. A limit sized for "attempts per
  // attacker" would instead cap logins for the whole application. To key on the
  // submitted username instead, override ThrottlerGuard#getTracker.
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiBody({ type: LoginUserReq })
  login(@Body() body: unknown) {
    return this.authService.login(body);
  }

  // Higher than login: every active session refreshes on its own schedule, and
  // behind a BFF they all arrive from the same IP. Guessing a token is hopeless
  // anyway at 256 bits — this limit is about resource abuse, not brute force.
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiBody({ type: RefreshTokenReq })
  refresh(@Body() body: unknown) {
    return this.authService.refresh(body);
  }

  // 204 whether or not the token existed: a different answer would confirm
  // which tokens are live.
  @Post('logout')
  @HttpCode(204)
  @ApiBody({ type: RefreshTokenReq })
  logout(@Body() body: unknown) {
    return this.authService.logout(body);
  }

  @Post('logout-all')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  logoutAll(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.revokeAllForUser(user.id);
  }

  /**
   * Exchanges a provider token for our own session — the API stays the
   * authority, and the provider never appears again after this call.
   *
   * Not in SecurityMiddleware.openPaths: the BFF calls this like any other
   * endpoint, signature included. Only a redirect arriving straight from a
   * provider (an OAuth callback) needs to bypass signing.
   */
  @Post('external/session')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiBody({ type: ExternalSessionReq })
  async externalSession(@Body() body: unknown) {
    const dto = this.validation.validate(AuthValidation.EXTERNAL_SESSION, body);

    const identity = await this.externalAuth.verify(dto.token);

    const user = await this.authService.linkExternalUser({
      provider: this.externalAuth.providerName,
      externalId: identity.externalId,
      username: identity.username,
      name: identity.name,
    });

    return {
      user,
      ...(await this.authService.issueTokens(
        user.id,
        user.username,
        user.role,
      )),
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
