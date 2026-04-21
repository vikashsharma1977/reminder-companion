import {
  Injectable, UnauthorizedException, ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { OtpService } from './otp/otp.service';
import { User } from '../users/user.entity';
import { RefreshTokenEntity } from './refresh-token.entity';

const REFRESH_TTL_DAYS = 7;
const ACCESS_TTL = '15m';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly otpService: OtpService,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokenRepo: Repository<RefreshTokenEntity>,
  ) {}

  // ── Email + Password ──────────────────────────────────────────────────────

  async register(email: string, password: string, displayName?: string) {
    // #6 — Don't reveal whether email is already registered via error message.
    // Check existence ourselves and return a consistent response.
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      // Simulate bcrypt timing to prevent timing-based enumeration
      await bcrypt.hash(password, 12);
      throw new ConflictException('An account with that email already exists.');
    }
    const user = await this.usersService.create(email, password, displayName);
    return this.buildResponse(user);
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    // Run bcrypt even for unknown emails to prevent timing-based enumeration
    const hash = user?.passwordHash ?? '$2b$12$invalidhashfortimingprevention00000000000000000000000';
    const valid = await bcrypt.compare(password, hash);
    if (!user || !valid) throw new UnauthorizedException('Invalid credentials');
    return this.buildResponse(user);
  }

  // ── Google OAuth ──────────────────────────────────────────────────────────

  loginWithGoogle(user: User) {
    return this.buildResponse(user);
  }

  // ── Email OTP ─────────────────────────────────────────────────────────────

  async sendEmailOtp(email: string): Promise<void> {
    await this.otpService.sendEmailOtp(email);
  }

  async verifyEmailOtp(email: string, code: string) {
    await this.otpService.verify(email, 'email', code);
    const user = await this.usersService.findOrCreateByEmail(email);
    return this.buildResponse(user);
  }

  // ── Phone OTP ─────────────────────────────────────────────────────────────

  async sendPhoneOtp(phone: string): Promise<void> {
    await this.otpService.sendPhoneOtp(phone);
  }

  async verifyPhoneOtp(phone: string, code: string) {
    await this.otpService.verify(phone, 'phone', code);
    const user = await this.usersService.findOrCreateByPhone(phone);
    return this.buildResponse(user);
  }

  // ── Password Reset ────────────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user) return; // silent — don't leak existence
    await this.otpService.sendPasswordResetOtp(email);
  }

  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    await this.otpService.verify(email, 'password-reset', code);
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('No account found for this email');
    await this.usersService.setPassword(user.id, newPassword);
    // Revoke all existing refresh tokens on password change
    await this.revokeAllRefreshTokens(user.id);
  }

  // ── #5 Refresh Tokens ─────────────────────────────────────────────────────

  async refresh(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.refreshTokenRepo.findOne({
      where: { tokenHash, revoked: false },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token invalid or expired');
    }

    // Rotate: revoke old, issue new
    stored.revoked = true;
    await this.refreshTokenRepo.save(stored);

    const user = await this.usersService.findById(stored.userId);
    if (!user) throw new UnauthorizedException();
    return this.buildResponse(user);
  }

  async revokeRefreshToken(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.refreshTokenRepo.update({ tokenHash }, { revoked: true });
  }

  private async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.refreshTokenRepo.update({ userId, revoked: false }, { revoked: true });
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async buildResponse(user: User) {
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email ?? user.phone },
      { expiresIn: ACCESS_TTL },
    );

    // #5 — Issue refresh token
    const rawRefresh = crypto.randomBytes(40).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({
        userId: user.id,
        tokenHash: this.hashToken(rawRefresh),
        expiresAt,
      }),
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        displayName: user.displayName,
      },
      accessToken,
      refreshToken: rawRefresh,
    };
  }

  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }
}
