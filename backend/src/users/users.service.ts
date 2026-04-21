import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';

interface GoogleProfile {
  googleId: string;
  email: string | null;
  displayName: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(email: string, password: string, displayName?: string): Promise<User> {
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = this.userRepo.create({ email, passwordHash, displayName });
    return this.userRepo.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email })
      .getOne();
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { phone } });
  }

  async findOrCreateByGoogle({ googleId, email, displayName }: GoogleProfile): Promise<User> {
    // Check by googleId first
    let user = await this.userRepo.findOne({ where: { googleId } });
    if (user) return user;

    // Check by email (link existing account)
    if (email) {
      user = await this.userRepo.findOne({ where: { email } });
      if (user) {
        user.googleId = googleId;
        user.emailVerified = true;
        return this.userRepo.save(user);
      }
    }

    // New user — coerce null → undefined so TypeORM create() is happy
    return this.userRepo.save(
      this.userRepo.create({ googleId, email: email ?? undefined, displayName, emailVerified: true }),
    );
  }

  async findOrCreateByEmail(email: string): Promise<User> {
    let user = await this.userRepo.findOne({ where: { email } });
    if (!user) {
      user = await this.userRepo.save(
        this.userRepo.create({ email, emailVerified: true }),
      );
    } else {
      user.emailVerified = true;
      user = await this.userRepo.save(user);
    }
    return user;
  }

  async findOrCreateByPhone(phone: string): Promise<User> {
    let user = await this.userRepo.findOne({ where: { phone } });
    if (!user) {
      user = await this.userRepo.save(
        this.userRepo.create({ phone, phoneVerified: true }),
      );
    } else {
      user.phoneVerified = true;
      user = await this.userRepo.save(user);
    }
    return user;
  }

  async setPassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.userRepo.update(userId, { passwordHash });
  }

  async updateFcmToken(userId: string, fcmToken: string): Promise<void> {
    await this.userRepo.update(userId, { fcmToken });
  }

  async updateProfile(userId: string, data: { displayName?: string; timezone?: string }): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    if (data.displayName !== undefined) user.displayName = data.displayName;
    if (data.timezone !== undefined) user.timezone = data.timezone;
    return this.userRepo.save(user) as Promise<User>;
  }

  async updatePreferences(userId: string, prefs: Partial<User['preferences']>): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    user.preferences = { ...user.preferences, ...prefs };
    return this.userRepo.save(user) as Promise<User>;
  }
}
