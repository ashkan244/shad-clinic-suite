import 'reflect-metadata';
import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // Behind nginx / Liara's proxy: use X-Forwarded-For so rate limits are per client, not per proxy.
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: false }));
  // Serve uploaded files (medical-record images) at /uploads.
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  app.use(cookieParser());
  app.enableCors({
    origin: true,
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false
    })
  );
  app.setGlobalPrefix('api');
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
}

bootstrap();
