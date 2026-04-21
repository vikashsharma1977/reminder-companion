import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { OtpService } from './otp/otp.service';
import { OtpEntity } from './otp/otp.entity';
import { RefreshTokenEntity } from './refresh-token.entity';
import { SseTicketService } from './sse-ticket.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    PassportModule,
    TypeOrmModule.forFeature([OtpEntity, RefreshTokenEntity]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // #1 — No fallback; env validation guarantees JWT_SECRET is present
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' }, // #5 — short-lived access tokens
      }),
    }),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService, JwtStrategy, OtpService, SseTicketService,
    // Only register Google strategy when credentials are configured
    ...(process.env.GOOGLE_CLIENT_ID ? [GoogleStrategy] : []),
  ],
  exports: [SseTicketService],
})
export class AuthModule {}
