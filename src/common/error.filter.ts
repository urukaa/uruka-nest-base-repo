import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { flattenError, ZodError } from 'zod';

type Described = {
  status: number;
  message: string;
  errors: unknown;
};

// Plain number rather than HttpStatus: `status` is a number, and comparing it
// against an enum member trips no-unsafe-enum-comparison.
const SERVER_ERROR_THRESHOLD = 500;

// Catch-all: previously only HttpException and ZodError were routed here, so
// everything else fell through to Nest's default filter and answered with a
// different response shape.
@Catch()
export class ErrorFilter implements ExceptionFilter {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { status, message, errors } = this.describe(exception);

    if (status >= SERVER_ERROR_THRESHOLD) {
      // The client gets a generic message; the detail belongs in the log.
      this.logger.error({
        message,
        path: req.originalUrl,
        method: req.method,
        error:
          exception instanceof Error
            ? { name: exception.name, message: exception.message }
            : exception,
        stack: exception instanceof Error ? exception.stack : undefined,
      });
    }

    res.status(status).json({
      statusCode: status,
      message,
      errors,
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    });
  }

  private describe(exception: unknown): Described {
    if (exception instanceof ZodError) {
      // zod v4: .flatten() is deprecated in favour of the standalone helper.
      const { fieldErrors, formErrors } = flattenError(exception);
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        errors: { fieldErrors, formErrors },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return { status, message: payload, errors: null };
      }

      const body = payload as Record<string, unknown>;

      return {
        status,
        message:
          typeof body.message === 'string' ? body.message : exception.message,
        errors: Array.isArray(body.message)
          ? body.message
          : (body.errors ?? null),
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal Server Error',
      errors: null,
    };
  }
}
