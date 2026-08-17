import { Injectable } from '@nestjs/common';
import { ZodType } from 'zod';

@Injectable()
export class ValidationService {
  /**
   * `data` is deliberately `unknown`: the whole point of validating is to
   * establish `T`, so accepting `T` as input would ask the caller to assert
   * the very thing this method is meant to prove.
   */
  validate<T>(zodType: ZodType<T>, data: unknown): T {
    return zodType.parse(data);
  }
}
