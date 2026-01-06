import {
  Controller,
  Get,
  HttpCode,
} from '@nestjs/common';
import { HealthyCheckService } from './healthycheck.service';

@Controller('/api/health')
export class HealthyCheckController {
  constructor(private readonly healthyCheckService: HealthyCheckService) {}

  @Get()
  @HttpCode(200)
  async healthyCheck() {
    return this.healthyCheckService.healthyCheck();
  }

}
