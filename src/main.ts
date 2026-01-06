import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { appBanner, displayAsciiArt } from './utils/ascii.utils';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { requireEnv } from './common/env';
import { SecurityMiddleware } from './middleware/security.middleware';

async function bootstrap() {
  console.log('PORT:', process.env.PORT);
  displayAsciiArt(appBanner);
  const app = await NestFactory.create(AppModule);

  //  LOGGING
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  if (requireEnv('IS_VO1D_PRODUCTION') === `mboten`) {
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
  const rawOrigins = requireEnv('ORIGINS') || 'http://127.0.0.1:3000';
  const allowedOrigins = rawOrigins
    ? rawOrigins.split(',').map((origin) => origin.trim())
    : ['*'];

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

  // APP_KEY MIDDLEWARE
  if (requireEnv('IS_VO1D_TESTING') === `mboten`) {
    const securityMiddleware = new SecurityMiddleware();
    app.use(securityMiddleware.use.bind(securityMiddleware));
  }

  await app.listen(Number(requireEnv('PORT')));
}
bootstrap();
