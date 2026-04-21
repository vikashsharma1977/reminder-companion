import {
  Controller, Post, Get, Body, HttpCode, HttpStatus,
  UseGuards, Request, Res, Logger, UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { SseTicketService } from './sse-ticket.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  RegisterDto, LoginDto,
  SendEmailOtpDto, VerifyEmailOtpDto,
  SendPhoneOtpDto, VerifyPhoneOtpDto,
  ForgotPasswordDto, ResetPasswordDto,
  RefreshTokenDto,
} from './dto/auth.dto';
import { User } from '../users/user.entity';

type AuthReq = { user: User };

// #2 — Auth endpoints get a much tighter rate limit than the global 100/60 s
const AUTH_THROTTLE  = { default: { ttl: 60_000, limit: 10 } };  // 10 / min
const OTP_THROTTLE   = { default: { ttl: 60_000, limit: 5  } };  // 5 / min
const RESET_THROTTLE = { default: { ttl: 60_000, limit: 5  } };

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly sseTicketService: SseTicketService,
    private readonly config: ConfigService,
  ) {}

  // ── Email + Password ──────────────────────────────────────────────────────

  @Post('register')
  @Throttle(AUTH_THROTTLE)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.email, dto.password, dto.displayName);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  // ── #5 Refresh / Logout ───────────────────────────────────────────────────

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SkipThrottle()
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.revokeRefreshToken(dto.refreshToken);
  }

  // ── #7 SSE Ticket ─────────────────────────────────────────────────────────

  @Post('sse-ticket')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  getSseTicket(@Request() req: AuthReq) {
    const ticket = this.sseTicketService.issue(req.user.id);
    return { ticket };
  }

  // ── Google OAuth ──────────────────────────────────────────────────────────

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @SkipThrottle()
  googleAuth() {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @SkipThrottle()
  async googleCallback(@Request() req: { user: User }, @Res() res: Response) {
    try {
      const result = await this.authService.loginWithGoogle(req.user);
      const frontendUrl = this.config.get<string>('FRONTEND_URL');
      // Pass both tokens via fragment so they never hit the server log
      const params = new URLSearchParams({
        at: result.accessToken,
        rt: result.refreshToken,
      });
      return res.redirect(`${frontendUrl}/auth/callback#${params.toString()}`);
    } catch (err) {
      this.logger.error('Google callback error', err);
      const frontendUrl = this.config.get<string>('FRONTEND_URL');
      return res.redirect(`${frontendUrl}/auth/login?error=google_failed`);
    }
  }

  // ── Email OTP ─────────────────────────────────────────────────────────────

  @Post('otp/email/send')
  @HttpCode(HttpStatus.OK)
  @Throttle(OTP_THROTTLE)
  async sendEmailOtp(@Body() dto: SendEmailOtpDto) {
    await this.authService.sendEmailOtp(dto.email);
    return { message: 'OTP sent' };
  }

  @Post('otp/email/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle(OTP_THROTTLE)
  verifyEmailOtp(@Body() dto: VerifyEmailOtpDto) {
    return this.authService.verifyEmailOtp(dto.email, dto.code);
  }

  // ── Phone OTP ─────────────────────────────────────────────────────────────

  @Post('otp/phone/send')
  @HttpCode(HttpStatus.OK)
  @Throttle(OTP_THROTTLE)
  async sendPhoneOtp(@Body() dto: SendPhoneOtpDto) {
    await this.authService.sendPhoneOtp(dto.phone);
    return { message: 'OTP sent' };
  }

  @Post('otp/phone/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle(OTP_THROTTLE)
  verifyPhoneOtp(@Body() dto: VerifyPhoneOtpDto) {
    return this.authService.verifyPhoneOtp(dto.phone, dto.code);
  }

  // ── Password Reset ────────────────────────────────────────────────────────

  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  @Throttle(RESET_THROTTLE)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return { message: 'If that email is registered, a reset code has been sent.' };
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @Throttle(RESET_THROTTLE)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.email, dto.code, dto.newPassword);
    return { message: 'Password updated. You can now sign in.' };
  }
}
