import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { isProduction, requireEnv } from './env';

/**
 * Query events carry the SQL and its parameters, so they stay out of
 * production logs where they would leak user data into the log sink.
 *
 * Read lazily, never at module scope: this file is imported through
 * CommonModule before AppModule's `@Module` decorator runs, so at import time
 * ConfigModule has not yet loaded .env into process.env.
 */
function shouldLogQueries(): boolean {
  return !isProduction();
}

function buildLogLevels(): Prisma.LogDefinition[] {
  const levels: Prisma.LogDefinition[] = [
    { emit: 'event', level: 'info' },
    { emit: 'event', level: 'warn' },
    { emit: 'event', level: 'error' },
  ];

  if (shouldLogQueries()) {
    levels.push({ emit: 'event', level: 'query' });
  }

  return levels;
}

/**
 * PrismaClient only exposes a typed `$on` when its log option is a literal
 * tuple, which a conditionally-built array cannot be. This narrows the event
 * surface instead of casting the whole client to `any`.
 */
interface PrismaEventEmitter {
  $on(
    event: 'info' | 'warn' | 'error',
    callback: (event: Prisma.LogEvent) => void,
  ): void;
  $on(event: 'query', callback: (event: Prisma.QueryEvent) => void): void;
}

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
      log: buildLogLevels(),
    });
  }

  onModuleInit() {
    const events = this as unknown as PrismaEventEmitter;

    events.$on('info', (event) => this.logger.info(event));
    events.$on('warn', (event) => this.logger.warn(event));
    events.$on('error', (event) => this.logger.error(event));

    if (shouldLogQueries()) {
      events.$on('query', (event) => this.logger.debug(event));
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
