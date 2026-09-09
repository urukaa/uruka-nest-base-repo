import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { WinstonModule } from 'nest-winston';
import r2Config from 'src/config/r2.config';
import * as winston from 'winston';
import { PrismaService } from './prisma.service';
import { ValidationService } from './validation.service';
import { ErrorFilter } from './error.filter';
import { APP_FILTER } from '@nestjs/core';
import { R2Service } from './r2.service';

// forFeature, never forRoot: a second forRoot here would register a competing
// ConfigService that had never loaded the namespaced configs. forFeature only
// adds r2Config to this module's context, which is what makes CommonModule
// importable on its own — by a test, or by a feature module in isolation.
@Global()
@Module({
  imports: [
    ConfigModule.forFeature(r2Config),

    // registerAsync, not register: the limit comes from config, and a
    // synchronous register() would read it before .env is loaded.
    //
    // This is where an oversized upload is actually stopped — multer aborts
    // the request mid-stream, so the bytes never reach memory. R2Service's
    // own check runs long after that point.
    MulterModule.registerAsync({
      imports: [ConfigModule.forFeature(r2Config)],
      inject: [r2Config.KEY],
      useFactory: (config: ConfigType<typeof r2Config>) => ({
        limits: { fileSize: config.maxUploadBytes },
      }),
    }),
    WinstonModule.forRoot({
      format: winston.format.json(),
      transports: [new winston.transports.Console()],
    }),
  ],
  providers: [
    PrismaService,
    ValidationService,
    { provide: APP_FILTER, useClass: ErrorFilter },
    R2Service,
  ],
  exports: [PrismaService, ValidationService, R2Service],
})
export class CommonModule {}
