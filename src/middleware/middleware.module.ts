import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { SecurityMiddleware } from './security.middleware';

@Module({})
export class MiddlewareModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // `{*splat}` rather than `*`: Express 5 (Nest 11) rejects a bare wildcard.
    consumer.apply(SecurityMiddleware).forRoutes('{*splat}');
  }
}
