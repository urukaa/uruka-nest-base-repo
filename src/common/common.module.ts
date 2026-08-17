import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
