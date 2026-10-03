import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/errors/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Uploads
  const uploadsDir = join(process.cwd(), 'uploads');

  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }

  app.useStaticAssets(uploadsDir, {
    prefix: '/uploads',
  });

  // ---------------------------------------------------------
  // CORS
  // ---------------------------------------------------------

  const allowedOrigins = new Set([
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',

    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',

    'http://192.168.1.2:3000',
    'http://192.168.1.2:5173',
    'http://192.168.1.2:5174',
  ]);

  // إضافة أي Origins موجودة في .env
  const envOrigins =
    process.env.CORS_ORIGINS
      ?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];

  for (const origin of envOrigins) {
    allowedOrigins.add(origin);
  }

  app.enableCors({
    origin: (origin, callback) => {
      // Requests without Origin
      // مثل Postman / Swagger / server-to-server
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      console.warn(`CORS blocked origin: ${origin}`);

      return callback(new Error(`CORS blocked origin: ${origin}`), false);
    },

    credentials: true,

    methods: [
      'GET',
      'HEAD',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],

    exposedHeaders: [
      'Content-Disposition',
    ],

    optionsSuccessStatus: 204,
  });

  // ---------------------------------------------------------
  // Validation
  // ---------------------------------------------------------

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

  // ---------------------------------------------------------
  // Swagger
  // ---------------------------------------------------------

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Pallet API')
      .setDescription(
        'POS, Invoicing & Serialized Inventory Management',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);

    SwaggerModule.setup('api/docs', app, document);
  }

  // ---------------------------------------------------------
  // Start
  // ---------------------------------------------------------

  const port = Number(process.env.PORT) || 3001;

  await app.listen(port, '0.0.0.0');

  console.log(
    `Pallet backend running on http://0.0.0.0:${port}`,
  );
  console.log(
    `Allowed CORS origins: ${Array.from(allowedOrigins).join(', ')}`,
  );
}

bootstrap();