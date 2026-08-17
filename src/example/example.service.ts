import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { PrismaService } from 'src/common/prisma.service';
import { R2Service } from 'src/common/r2.service';
import { ValidationService } from 'src/common/validation.service';
import { Logger } from 'winston';

/**
 * Scaffold to copy when adding a feature module. The constructor lists the
 * globally available services so a new module starts from a working shape.
 */
@Injectable()
export class ExampleService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly prismaService: PrismaService,
    private readonly r2Service: R2Service,
    private readonly validationService: ValidationService,
  ) {}

  async staffPosition() {
    this.logger.info(`Example Data`);
    return 'hello';
  }
}
