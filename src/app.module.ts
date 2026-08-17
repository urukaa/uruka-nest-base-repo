import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CommonModule } from './common/common.module';
import { HealthyCheckModule } from './healthy_check/healthycheck.module';
import { MiddlewareModule } from './middleware/middleware.module';
import { AuthModule } from './auth/auth.module';
import { envNumber } from './common/env';
import jwtConfig from './auth/config/jwt.config';
import r2Config from './config/r2.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, //  the config can be accessed from anywhere
      load: [jwtConfig, r2Config], // All configs are loaded here
    }),

    // forRootAsync, not forRoot: the factory runs during DI, so it cannot read
    // env before ConfigModule has loaded .env regardless of import order.
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [
          {
            ttl: envNumber('THROTTLE_TTL_SECONDS', 60) * 1000,
            limit: envNumber('THROTTLE_LIMIT', 100),
          },
        ],
      }),
    }),

    CommonModule,
    MiddlewareModule,
    AuthModule,
    HealthyCheckModule,
  ],
  controllers: [],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
