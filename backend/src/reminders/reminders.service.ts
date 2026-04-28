import { Injectable, NotFoundException, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Reminder, ReminderStatus, RecurrenceType } from './reminder.entity';
import { CreateReminderDto } from './dto/create-reminder.dto';

export const SNOOZE_MINUTES = 10;

@Injectable()
export class RemindersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    @InjectRepository(Reminder)
    private readonly reminderRepo: Repository<Reminder>,
    @InjectQueue('reminders')
    private readonly reminderQueue: Queue,
  ) {}

  // On every backend start, advance recurring reminders whose scheduledAt
  // fell behind due to backend downtime or Bull queue losses.
  async onApplicationBootstrap(): Promise<void> {
    try {
      const now = new Date();
      const stale = await this.reminderRepo
        .createQueryBuilder('r')
        .where('r.status = :status', { status: ReminderStatus.ACTIVE })
        .andWhere('r.recurrence != :none', { none: RecurrenceType.NONE })
        .andWhere('r.scheduledAt < :now', { now })
        .getMany();

      for (const reminder of stale) {
        await this.advanceToNextOccurrence(reminder);
      }
      if (stale.length > 0) {
        this.logger.log(`Repaired ${stale.length} stale recurring reminder(s)`);
      }
    } catch (err) {
      this.logger.error('Failed to repair stale recurring reminders', err);
    }
  }

  private async advanceToNextOccurrence(reminder: Reminder): Promise<void> {
    if (!reminder.scheduledAt) return;
    const now = new Date();
    let nextAt = new Date(reminder.scheduledAt);

    while (nextAt <= now) {
      if (reminder.recurrence === RecurrenceType.DAILY) {
        nextAt = new Date(nextAt.getTime() + 24 * 60 * 60 * 1000);
      } else if (reminder.recurrence === RecurrenceType.WEEKLY) {
        nextAt = new Date(nextAt.getTime() + 7 * 24 * 60 * 60 * 1000);
      } else {
        return;
      }
    }

    await this.reminderRepo.update(reminder.id, { scheduledAt: nextAt });
    const delay = nextAt.getTime() - Date.now();
    if (delay > 0) {
      await this.reminderQueue.add('fire', { reminderId: reminder.id }, { delay });
      this.logger.log(`Advanced stale reminder "${reminder.title}" → ${nextAt.toISOString()}`);
    }
  }

  async create(userId: string, dto: CreateReminderDto): Promise<Reminder> {
    const reminder = this.reminderRepo.create({ ...dto, userId });
    const saved = await this.reminderRepo.save(reminder);

    if (saved.scheduledAt) {
      const delay = new Date(saved.scheduledAt).getTime() - Date.now();
      if (delay > 0) {
        await this.reminderQueue.add('fire', { reminderId: saved.id }, { delay });
      }
    }

    return saved;
  }

  async findAllForUser(userId: string): Promise<Reminder[]> {
    return this.reminderRepo.find({
      where: { userId, status: ReminderStatus.ACTIVE },
      order: { scheduledAt: 'ASC' },
    });
  }

  async findOne(userId: string, id: string): Promise<Reminder> {
    const reminder = await this.reminderRepo.findOne({ where: { id, userId } });
    if (!reminder) throw new NotFoundException('Reminder not found');
    return reminder;
  }

  async update(userId: string, id: string, dto: Partial<CreateReminderDto>): Promise<Reminder> {
    const reminder = await this.findOne(userId, id);
    Object.assign(reminder, dto);
    return this.reminderRepo.save(reminder);
  }

  async markCompleted(userId: string, id: string): Promise<Reminder> {
    const reminder = await this.findOne(userId, id);
    const isRecurring = reminder.recurrence !== RecurrenceType.NONE;
    if (isRecurring) {
      // For recurring reminders, just stamp lastFiredAt — the processor already
      // moved scheduledAt to the next occurrence, so it won't show in today's list.
      reminder.lastFiredAt = new Date();
    } else {
      reminder.status = ReminderStatus.COMPLETED;
    }
    return this.reminderRepo.save(reminder);
  }

  async markMissed(id: string): Promise<void> {
    await this.reminderRepo.increment({ id }, 'missedCount', 1);
    await this.reminderRepo.update(id, { lastFiredAt: new Date() });
  }

  async snooze(userId: string, id: string, minutes = SNOOZE_MINUTES): Promise<Reminder> {
    const reminder = await this.findOne(userId, id);
    const newTime = new Date(Date.now() + minutes * 60 * 1000);
    reminder.scheduledAt = newTime;
    reminder.status = ReminderStatus.ACTIVE;
    const saved = await this.reminderRepo.save(reminder);

    const delay = newTime.getTime() - Date.now();
    await this.reminderQueue.add('fire', { reminderId: saved.id }, { delay });

    return saved;
  }

  async remove(userId: string, id: string): Promise<void> {
    const reminder = await this.findOne(userId, id);
    await this.reminderRepo.remove(reminder);
  }

  async getTodaysReminders(userId: string): Promise<Reminder[]> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    return this.reminderRepo
      .createQueryBuilder('r')
      .where('r.userId = :userId', { userId })
      .andWhere('r.status = :status', { status: ReminderStatus.ACTIVE })
      .andWhere(
        // 1. Scheduled for today
        // 2. Anytime (no scheduledAt)
        // 3. Recurring and already fired today (scheduledAt was advanced to tomorrow
        //    by the processor, but we still want "done today" visible)
        `(
          r.scheduledAt BETWEEN :start AND :end
          OR r.scheduledAt IS NULL
          OR (r.recurrence != :none AND r.lastFiredAt BETWEEN :start AND :end)
        )`,
        { start, end, none: RecurrenceType.NONE },
      )
      .orderBy('r.scheduledAt', 'ASC', 'NULLS LAST')
      .getMany();
  }

  async getFrequentlyMissed(userId: string): Promise<Reminder[]> {
    return this.reminderRepo.find({
      where: { userId, status: ReminderStatus.ACTIVE },
      order: { missedCount: 'DESC' },
      take: 5,
    });
  }

  // Returns reminders that fired within the last 90 seconds — used by mobile polling
  async getFiring(userId: string): Promise<Reminder[]> {
    const cutoff = new Date(Date.now() - 90 * 1000);
    return this.reminderRepo
      .createQueryBuilder('r')
      .where('r.userId = :userId', { userId })
      .andWhere('r.status = :status', { status: ReminderStatus.ACTIVE })
      .andWhere('r.lastFiredAt IS NOT NULL')
      .andWhere('r.lastFiredAt >= :cutoff', { cutoff })
      .getMany();
  }
}
