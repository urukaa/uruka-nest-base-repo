import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { PrismaService } from 'src/common/prisma.service';

@Injectable()
export class RefreshTokenCleanupService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'refresh-token-cleanup' })
  async removeExpired(): Promise<number> {
    try {
      const { count } = await this.prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });

      if (count > 0) {
        this.logger.info({
          message: 'Expired refresh tokens removed',
          count,
        });
      }

      return count;
    } catch (error) {
     
      this.logger.error({
        message: 'Refresh token cleanup failed',
        error: error instanceof Error ? error.message : error,
      });

      return 0;
    }
  }
}
