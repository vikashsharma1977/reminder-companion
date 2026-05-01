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
    // React Native and server-to-server callers send no Origin header — always allow.
    // Browser clients must be in the ALLOWED_ORIGINS whitelist.
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean);
      if (allowed.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`Reminder Companion API running on http://localhost:${port}/api/v1`);
}

bootstrap();
