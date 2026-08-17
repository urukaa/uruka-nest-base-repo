import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { PrismaService } from 'src/common/prisma.service';

/**
 * Past this the check reports the database as unreachable instead of holding
 * the request open. A health endpoint that hangs is worse than one that fails:
 * the orchestrator learns nothing and the connection stays tied up.
 */
const DB_TIMEOUT_MS = 3000;

type DatabaseState = 'up' | 'down' | 'timeout';

@Injectable()
export class HealthyCheckService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly prisma: PrismaService,
  ) {}

  async healthyCheck() {
    const database = await this.checkDatabase();

    if (database !== 'up') {
      // 503 so a load balancer or orchestrator takes this instance out of
      // rotation, instead of keeping traffic on it while every query fails.
      throw new ServiceUnavailableException({
        message: 'Service is unhealthy',
        errors: { database },
      });
    }

    return {
      status: 'ok',
      service: 'api',
      database,
      timestamp: new Date().toISOString(),
      message: 'Service is healthy',
    };
  }

  private async checkDatabase(): Promise<DatabaseState> {
    let timer: NodeJS.Timeout | undefined;

    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('__timeout__')),
            DB_TIMEOUT_MS,
          );
        }),
      ]);

      return 'up';
    } catch (error) {
      const timedOut =
        error instanceof Error && error.message === '__timeout__';

      this.logger.error({
        message: 'Health check: database unreachable',
        reason: timedOut ? 'timeout' : 'error',
        error: error instanceof Error ? error.message : error,
      });

      return timedOut ? 'timeout' : 'down';
    } finally {
      clearTimeout(timer);
    }
  }
}
