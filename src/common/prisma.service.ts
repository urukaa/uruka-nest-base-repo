import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { requireEnv } from './env';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {
    super({
      adapter: new PrismaPg({
        connectionString: requireEnv('DATABASE_URL'),
      }),
      log: [
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'query' },
      ],
    });
  }

  onModuleInit() {
    const prismaAny = this as any;

    prismaAny.$on('info', (e) => {
      this.logger.info(e);
    });

    prismaAny.$on('warn', (e) => {
      this.logger.warn(e);
    });

    prismaAny.$on('error', (e) => {
      this.logger.error(e);
    });

    prismaAny.$on('query', (e) => {
      this.logger.debug(e);
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
