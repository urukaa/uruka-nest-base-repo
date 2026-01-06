import { Module } from '@nestjs/common';
import { HealthyCheckService } from './healthycheck.service';
import { HealthyCheckController } from './healthycheck.controller';

@Module({
  providers: [HealthyCheckService],
  controllers: [HealthyCheckController],
})
export class healthyCheckModule {}
