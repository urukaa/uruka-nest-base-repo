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
import { JwtAuthGuard } from './guards/jwt-auth/jwt-auth.guard';
import {
  LoginUserReq,
  RefreshTokenReq,
  RegisterUserReq,
} from 'src/model/user.model';
import { AuthenticatedUser } from './types/auth.jwtPayload';

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
