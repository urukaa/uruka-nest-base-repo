import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

@Injectable()
export class HealthyCheckService {
  constructor(@Inject(WINSTON_MODULE_PROVIDER) private logger: Logger) {}

  healthyCheck() {
    return {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
      message: 'Service is healthy',
    };
  }
}
