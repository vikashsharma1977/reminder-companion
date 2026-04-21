import {
  Injectable, BadRequestException, Logger, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { OtpEntity } from './otp.entity';

const MAX_ATTEMPTS = 5;

const OTP_TTL_MINUTES = 10;
const MAX_CODE = 999999;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @InjectRepository(OtpEntity)
    private readonly otpRepo: Repository<OtpEntity>,
    private readonly config: ConfigService,
  ) {}

  // ── generate & persist ───────────────────────────────────────────────────

  private generateCode(): string {
    return String(Math.floor(100000 + Math.random() * MAX_CODE)).slice(0, 6);
  }

  async sendPasswordResetOtp(email: string): Promise<void> {
    const code = await this.saveOtp(email, 'password-reset');

    const smtpHost = this.config.get<string>('SMTP_HOST');
    const smtpUser = this.config.get<string>('SMTP_USER');
    const smtpPass = this.config.get<string>('SMTP_PASS');

    if (!smtpHost || !smtpUser) {
      this.logger.warn(`[DEV] Password reset OTP for ${email}: ${code}`);
      return;
    }

    const transport = nodemailer.createTransport({
      host: smtpHost,
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: false,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transport.sendMail({
      from: `"Reminder Companion" <${smtpUser}>`,
      to: email,
      subject: `Reset your password — code: ${code}`,
      html: `
        <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:32px">
          <h2 style="color:#6C5CE7;margin-bottom:8px">Password Reset</h2>
          <p style="color:#555;margin-bottom:24px">Use the code below to reset your Reminder Companion password. It expires in 10 minutes.</p>
          <div style="background:#FEF2F2;border-radius:12px;padding:24px;text-align:center;font-size:36px;font-weight:700;letter-spacing:8px;color:#EF4444">${code}</div>
          <p style="color:#999;font-size:12px;margin-top:24px">If you didn't request a password reset, you can safely ignore this email.</p>
        </div>
      `,
    });
  }

  private async saveOtp(target: string, type: 'email' | 'phone' | 'password-reset'): Promise<string> {
    // Invalidate any previous unused OTPs for this target
    await this.otpRepo.update(
      { target, type, used: false },
      { used: true },
    );

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    await this.otpRepo.save(this.otpRepo.create({ target, type, code, expiresAt }));
    return code;
  }

  // ── verify ────────────────────────────────────────────────────────────────

  async verify(target: string, type: 'email' | 'phone' | 'password-reset', code: string): Promise<void> {
    // Find a live, unused OTP for this target (ignore code here — check attempts first)
    const otp = await this.otpRepo.findOne({
      where: { target, type, used: false, expiresAt: MoreThan(new Date()) },
      order: { createdAt: 'DESC' },
    });

    // #4 — Locked out or no valid OTP
    if (!otp) throw new BadRequestException('Invalid or expired OTP');
    if (otp.attempts >= MAX_ATTEMPTS) {
      throw new ForbiddenException('Too many incorrect attempts. Request a new code.');
    }

    if (otp.code !== code) {
      otp.attempts += 1;
      await this.otpRepo.save(otp);
      const remaining = MAX_ATTEMPTS - otp.attempts;
      throw new BadRequestException(
        remaining > 0
          ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Too many incorrect attempts. Request a new code.',
      );
    }

    otp.used = true;
    await this.otpRepo.save(otp);
  }

  // ── email OTP ─────────────────────────────────────────────────────────────

  async sendEmailOtp(email: string): Promise<void> {
    const code = await this.saveOtp(email, 'email');

    const smtpHost = this.config.get<string>('SMTP_HOST');
    const smtpUser = this.config.get<string>('SMTP_USER');
    const smtpPass = this.config.get<string>('SMTP_PASS');

    if (!smtpHost || !smtpUser) {
      this.logger.warn(`[DEV] Email OTP for ${email}: ${code}`);
      return;
    }

    const transport = nodemailer.createTransport({
      host: smtpHost,
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: false,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transport.sendMail({
      from: `"Reminder Companion" <${smtpUser}>`,
      to: email,
      subject: `Your verification code: ${code}`,
      html: `
        <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:32px">
          <h2 style="color:#6C5CE7;margin-bottom:8px">Reminder Companion</h2>
          <p style="color:#555;margin-bottom:24px">Use the code below to verify your email address. It expires in ${OTP_TTL_MINUTES} minutes.</p>
          <div style="background:#F5F3FF;border-radius:12px;padding:24px;text-align:center;font-size:36px;font-weight:700;letter-spacing:8px;color:#6C5CE7">${code}</div>
          <p style="color:#999;font-size:12px;margin-top:24px">If you didn't request this, you can safely ignore it.</p>
        </div>
      `,
    });
  }

  // ── phone / SMS OTP ───────────────────────────────────────────────────────

  async sendPhoneOtp(phone: string): Promise<void> {
    const code = await this.saveOtp(phone, 'phone');

    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken  = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const fromNumber = this.config.get<string>('TWILIO_PHONE_NUMBER');

    if (!accountSid || !authToken || !fromNumber) {
      this.logger.warn(`[DEV] Phone OTP for ${phone}: ${code}`);
      return;
    }

    // Lazy-import twilio to keep startup fast when not configured
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const twilio = require('twilio');
    const client = twilio(accountSid, authToken);

    await client.messages.create({
      body: `Your Reminder Companion code: ${code}. Valid for ${OTP_TTL_MINUTES} minutes.`,
      from: fromNumber,
      to: phone,
    });
  }
}
