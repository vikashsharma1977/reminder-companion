import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum ReminderCategory {
  WORK = 'work',
  PERSONAL = 'personal',
  HEALTH = 'health',
  OTHER = 'other',
}

export enum ReminderStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  SNOOZED = 'snoozed',
  CANCELLED = 'cancelled',
}

export enum RecurrenceType {
  NONE = 'none',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  CUSTOM = 'custom',
}

@Entity('reminders')
export class Reminder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  title: string;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @Column({
    type: 'enum',
    enum: ReminderCategory,
    default: ReminderCategory.PERSONAL,
  })
  category: ReminderCategory;

  @Column({
    type: 'enum',
    enum: ReminderStatus,
    default: ReminderStatus.ACTIVE,
  })
  status: ReminderStatus;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledAt: Date;

  @Column({
    type: 'enum',
    enum: RecurrenceType,
    default: RecurrenceType.NONE,
  })
  recurrence: RecurrenceType;

  @Column({ type: 'jsonb', nullable: true })
  recurrenceConfig: {
    daysOfWeek?: number[];
    times?: string[];
    durationDays?: number;
    endDate?: string;
  };

  // Geofence support
  @Column({ nullable: true, type: 'decimal', precision: 9, scale: 6 })
  latitude: number;

  @Column({ nullable: true, type: 'decimal', precision: 9, scale: 6 })
  longitude: number;

  @Column({ nullable: true })
  locationName: string;

  @Column({ nullable: true, default: 200 })
  geofenceRadius: number; // meters

  // Intelligence tracking
  @Column({ default: 0 })
  missedCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastFiredAt: Date;

  @Column({ nullable: true })
  sourceType: string; // 'voice' | 'text' | 'ocr' | 'manual'

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
