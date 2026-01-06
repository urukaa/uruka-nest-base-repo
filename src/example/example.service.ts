import { HttpException, Inject, Injectable } from "@nestjs/common";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { PrismaService } from "src/common/prisma.service";
import { R2Service } from "src/common/r2.service";
import { ValidationService } from "src/common/validation.service";
import { Logger } from "winston";

@Injectable()
export class ExampleService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
    private readonly prismaService: PrismaService,
    private readonly r2Service: R2Service,
    private validationService: ValidationService,
  ) {}

 async staffPosition() {
    this.logger.info(`Example Data`);
    return "hello";
  }
}