import { LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { appBanner, displayAsciiArt } from './utils/ascii.utils';
import { envList, isProduction, optionalEnv, requireEnv } from './common/env';

async function bootstrap() {
  displayAsciiArt(appBanner);

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  //  LOGGING
  const logger = app.get<LoggerService>(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  // Lets PrismaService.onModuleDestroy run on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  // Required for req.ip to reflect the client rather than the proxy when the
  // app runs behind nginx/Cloudflare. Leave off otherwise: it makes
  // X-Forwarded-For spoofable, which the middleware's IP allowlist trusts.
  if (optionalEnv('TRUST_PROXY', '') !== '') {
    app.set('trust proxy', optionalEnv('TRUST_PROXY', '1'));
  }

  // SECURITY HEADERS
  app.use(
    helmet({
      // Swagger UI needs inline styles/scripts; CSP is off where docs are served.
      contentSecurityPolicy: isProduction(),
    }),
  );

  if (!isProduction()) {
    // API DOCS WITH SWAGGER
    const swaggerConfig = new DocumentBuilder()
      .setTitle('PROJECT NAME API')
      .setDescription('The API description')
      .setVersion('1.0')
      .addBearerAuth() // jika pakai JWT
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document); // akses di /api/docs
  }

  // CORS ORIGIN
  const allowedOrigins = envList('ORIGINS', ['http://127.0.0.1:3000']);

  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,OPTIONS,POST,DELETE',
    allowedHeaders: [
      'Content-Type',
      'x-app-key',
      'x-timestamp',
      'x-signature',
      'User-Agent',
    ],
    credentials: true, // Izinkan cookies
  });

  await app.listen(Number(requireEnv('PORT')));
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
