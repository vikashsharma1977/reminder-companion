import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RemindersModule } from './reminders/reminders.module';
import { ParserModule } from './parser/parser.module';
import { NotificationsModule } from './notifications/notifications.module';
import { envValidationSchema } from './config/env.validation';

@Module({
  imports: [
    // #1 — Validate all required env vars at startup; crash fast if any are missing
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),

    // #2 — Global rate limiting: 100 requests / 60 s per IP by default
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const databaseUrl = config.get<string>('DATABASE_URL') || '';
        let parsedHost = 'none';
        if (databaseUrl) {
          try { parsedHost = new URL(databaseUrl).hostname || 'EMPTY_HOST'; } catch { parsedHost = 'INVALID_URL'; }
        }
        console.log(`[DB] DATABASE_URL present=${!!databaseUrl} len=${databaseUrl.length} host=${parsedHost} prefix=${databaseUrl.slice(0, 14)}`);

        const base = {
          type: 'postgres' as const,
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
          synchronize: config.get('NODE_ENV') !== 'production',
          logging: config.get('NODE_ENV') === 'development',
        };
        if (databaseUrl && parsedHost && parsedHost !== 'EMPTY_HOST' && parsedHost !== 'INVALID_URL') {
          return { ...base, url: databaseUrl, ssl: { rejectUnauthorized: false } };
        }
        if (databaseUrl) {
          console.error(`[DB] DATABASE_URL is set but invalid (host="${parsedHost}") — falling back to individual DB_* vars`);
        }
        return {
          ...base,
          host: config.get<string>('DB_HOST'),
          port: config.get<number>('DB_PORT'),
          username: config.get<string>('DB_USER'),
          password: config.get<string>('DB_PASS'),
          database: config.get<string>('DB_NAME'),
        };
      },
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL') || '';
        return redisUrl
          ? { url: redisUrl }
          : {
              redis: {
                host: config.get('REDIS_HOST'),
                port: config.get<number>('REDIS_PORT'),
              },
            };
      },
    }),

    AuthModule,
    UsersModule,
    RemindersModule,
    ParserModule,
    NotificationsModule,
  ],
  providers: [
    // Apply ThrottlerGuard globally — individual controllers can use @Throttle() to override
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
