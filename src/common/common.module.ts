import { Global, Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { PrismaService } from './prisma.service';
import { ValidationService } from './validation.service';
import { ErrorFilter } from './error.filter';
import { APP_FILTER } from '@nestjs/core';
import { R2Service } from './r2.service';

// ConfigModule.forRoot is intentionally absent: AppModule already registers it
// globally with the namespaced configs, and a second forRoot here registered a
// competing ConfigService that had never loaded jwtConfig/r2Config.
@Global()
@Module({
  imports: [
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
