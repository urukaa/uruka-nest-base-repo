import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CommonModule } from './common/common.module';
import { HealthyCheckModule } from './healthy_check/healthycheck.module';
import { MiddlewareModule } from './middleware/middleware.module';
import jwtConfig from './auth/config/jwt.config';
import r2Config from './config/r2.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, //  the config can be accessed from anywhere
      load: [jwtConfig, r2Config], // All configs are loaded here
    }),

    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }], // 100 request / minute / IP
    }),

    CommonModule,
    MiddlewareModule,
    HealthyCheckModule,
  ],
  controllers: [],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
