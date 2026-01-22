import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // Logger
  app.useLogger(app.get(Logger));

  // Security
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  // CORS
  app.enableCors({
    origin: configService.get<string>('CORS_ORIGINS', '*').split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-API-Key'],
  });

  // API Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'api/v',
  });

  // Global prefix
  app.setGlobalPrefix('api', {
    exclude: ['health', 'ready', 'docs', 'docs-json'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger Documentation
  if (nodeEnv !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('WasslChat API')
      .setDescription(`
# WasslChat API Documentation

## Overview
WasslChat is a multi-tenant WhatsApp Commerce & CRM platform designed for Egyptian SMEs.

## Authentication
All API endpoints (except public ones) require authentication via JWT Bearer token.

### Getting a Token
1. POST /api/v1/auth/login with email and password
2. Use the returned access_token in the Authorization header

### Headers
- \`Authorization: Bearer <token>\` - Required for authenticated endpoints
- \`X-Tenant-ID\` - Optional, extracted from JWT if not provided

## Rate Limits
- Standard: 100 requests/minute
- Premium: 500 requests/minute  
- Enterprise: 2000 requests/minute

## Pagination
List endpoints support pagination via query parameters:
- \`page\`: Page number (default: 1)
- \`limit\`: Items per page (default: 20, max: 100)
- \`sortBy\`: Field to sort by
- \`sortOrder\`: 'asc' or 'desc'

## Filtering
Most list endpoints support filtering via query parameters specific to the resource.

## Response Format
All responses follow this structure:
\`\`\`json
{
  "success": true,
  "data": { ... },
  "meta": { "page": 1, "limit": 20, "total": 100 }
}
\`\`\`

## Error Handling
Errors return appropriate HTTP status codes with this structure:
\`\`\`json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": { ... }
  }
}
\`\`\`
      `)
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addApiKey(
        {
          type: 'apiKey',
          name: 'X-API-Key',
          in: 'header',
          description: 'API Key for external integrations',
        },
        'API-Key',
      )
      .addTag('Authentication', 'User authentication and session management')
      .addTag('Tenants', 'Tenant/Organization management')
      .addTag('Users', 'User management within tenants')
      .addTag('Contacts', 'Customer/Contact management')
      .addTag('Products', 'Product catalog management')
      .addTag('Categories', 'Product category management')
      .addTag('Orders', 'Order management')
      .addTag('Conversations', 'WhatsApp conversation management')
      .addTag('Messages', 'Message handling')
      .addTag('WhatsApp', 'WhatsApp session and connection management')
      .addTag('Chatbots', 'Chatbot flow management')
      .addTag('Broadcasts', 'Broadcast campaign management')
      .addTag('Payments', 'Payment processing')
      .addTag('Webhooks', 'Webhook management')
      .addTag('Analytics', 'Business analytics and reporting')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      customSiteTitle: 'WasslChat API Documentation',
      customfavIcon: '/favicon.ico',
      customCss: `
        .swagger-ui .topbar { display: none }
        .swagger-ui .info { margin: 20px 0 }
      `,
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
      },
    });
  }

  // Graceful shutdown
  app.enableShutdownHooks();

  await app.listen(port);

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 WasslChat API Server Started                         ║
║                                                           ║
║   Environment: ${nodeEnv.padEnd(40)}║
║   Port: ${String(port).padEnd(47)}║
║   API Docs: http://localhost:${port}/docs                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
}

bootstrap();
