import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { SecurityMiddleware } from './security.middleware';

@Module({})
export class MiddlewareModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecurityMiddleware).forRoutes('*');
  }
}
