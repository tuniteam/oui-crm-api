// ============================================
// OUI-CRM - Main Entry Point
// ============================================

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { AppModule } from './app.module';
import {
  AUTH_RATE_LIMIT_WINDOW_MS,
  AUTH_ENV,
  DEFAULT_AUTH_RATE_LIMIT_MAX,
  SWAGGER_BEARER_AUTH_SCHEME,
} from './auth/auth.constants';
import { API_PREFIX,
  APP_ENV,
  DEFAULT_NODE_ENV,
  DEFAULT_PORT,
  NodeEnv,
  SWAGGER_BEARER_AUTH,
} from './common/constants/app.constants';
import { ApiMessages } from './common/messages';
import { AllExceptionsFilter } from './common/pipes/all-exceptions.filter';
import { getNumber } from './common/utils/config.utils';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: APP_VERSION } = require('../package.json') as { version: string };

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const swagger = ApiMessages.swagger;

  const ENV = configService.get<string>(APP_ENV.NODE_ENV, DEFAULT_NODE_ENV) as NodeEnv;
  const PORT = getNumber(configService, 'PORT', DEFAULT_PORT);
  // Swagger "servers" entry: BASE_URL from .env, else the local port
  const BASE_URL = configService.get<string>(APP_ENV.BASE_URL) || `http://localhost:${PORT}`;

  // ============================================
  // HTTP hardening
  // ============================================
  app.use(helmet());
  app.use(
    `/${API_PREFIX}/auth`,
    rateLimit({
      windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
      max: getNumber(configService, AUTH_ENV.AUTH_RATE_LIMIT_MAX, DEFAULT_AUTH_RATE_LIMIT_MAX),
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.setGlobalPrefix(API_PREFIX);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip undecorated properties
      forbidNonWhitelisted: true, // error on unknown properties
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  // ============================================
  // CORS — origins from CORS_ORIGINS (comma-separated); '*' only when unset in development
  // ============================================
  const corsOrigins = (configService.get<string>(APP_ENV.CORS_ORIGINS) ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length ? corsOrigins : ENV === NodeEnv.DEVELOPMENT ? '*' : false,
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  });

  // ============================================
  // Swagger
  // ============================================
  const config = new DocumentBuilder()
    .setTitle(swagger.title)
    .setDescription(swagger.description)
    .setVersion(APP_VERSION)
    .addServer(
      BASE_URL,
      ENV === NodeEnv.UAT ? 'UAT Server' : ENV === NodeEnv.PRODUCTION ? 'Production Server' : 'Development',
    )
    .addBearerAuth(SWAGGER_BEARER_AUTH_SCHEME, SWAGGER_BEARER_AUTH)
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: swagger.title,
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
    },
  });

  // ============================================
  // Start
  // ============================================
  await app.listen(PORT, '0.0.0.0');

  console.log('');
  console.log('🚀 ====================================');
  console.log('   OUI-CRM API Server');
  console.log('====================================');
  console.log(`📡 Server:  http://localhost:${PORT}`);
  console.log(`📚 Swagger: http://localhost:${PORT}/api/docs`);
  console.log(`🔗 API:     http://localhost:${PORT}/${API_PREFIX}`);
  console.log('====================================');
  console.log('');
}

bootstrap();
