// ============================================
// OUI-CRM - Main Entry Point
// Point d'entrée de l'application NestJS
// ============================================

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/pipes/all-exceptions.filter';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const ENV = configService.get<string>('NODE_ENV', 'development'); // 'development' ou 'uat' ou 'production'
  const BASE_URL: string =
    ENV === 'uat' || ENV === 'production'
      ? (process.env.BASE_URL ?? 'http://localhost:3000')
      : 'http://localhost:3000';
  // ============================================
  // Global Prefix
  // ============================================
  app.setGlobalPrefix('api/v1');

  // ============================================
  // Validation Pipe
  // ============================================
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Supprime les propriétés non décorées
      forbidNonWhitelisted: true, // Erreur si propriétés inconnues
      transform: true, // Transforme les types automatiquement
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  // ============================================
  // CORS
  // ============================================
  app.enableCors({
    origin: '*',
    credentials: true,
  });

  // ============================================
  // Swagger Configuration
  // ============================================
  const config = new DocumentBuilder()
    .setTitle('OUI-CRM API')
    .setVersion('1.0.0')
    .addServer(
      BASE_URL,
      ENV === 'uat' ? 'UAT Server' : ENV === 'production' ? 'Production Server' : 'Development',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'access-token',
    )

    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'OUI-CRM API Documentation',
    customfavIcon: 'https://nestjs.com/img/logo_text.svg',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
    },
  });

  // ============================================
  // Start Server
  // ============================================
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  console.log('');
  console.log('🚀 ====================================');
  console.log('   OUI-CRM API Server');
  console.log('====================================');
  console.log(`📡 Server:  http://localhost:${port}`);
  console.log(`📚 Swagger: http://localhost:${port}/api/docs`);
  console.log(`🔗 API:     http://localhost:${port}/api/v1`);
  console.log('====================================');
  console.log('');
}

bootstrap();
