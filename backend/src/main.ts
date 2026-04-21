import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // #3 — Security headers
  app.use(helmet());

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    // React Native doesn't send an Origin header — allow all origins in production
    origin: process.env.NODE_ENV === 'production'
      ? true
      : (process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:8081']),
    credentials: true,
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`Reminder Companion API running on http://localhost:${port}/api/v1`);
}

bootstrap();
