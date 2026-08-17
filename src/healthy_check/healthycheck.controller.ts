import { Controller, Get, HttpCode } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthyCheckService } from './healthycheck.service';

@ApiTags('Health')
@Controller('/api/health')
export class HealthyCheckController {
  constructor(private readonly healthyCheckService: HealthyCheckService) {}

  @Get()
  @HttpCode(200)
  healthyCheck() {
    return this.healthyCheckService.healthyCheck();
  }
}
