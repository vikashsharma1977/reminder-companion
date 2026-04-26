import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Reminder, ReminderStatus, RecurrenceType } from './reminder.entity';
import { CreateReminderDto } from './dto/create-reminder.dto';

export const SNOOZE_MINUTES = 10;

@Injectable()
export class RemindersService {
  constructor(
    @InjectRepository(Reminder)
    private readonly reminderRepo: Repository<Reminder>,
    @InjectQueue('reminders')
    private readonly reminderQueue: Queue,
  ) {}

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
        // Include:
        // 1. Reminders scheduled for a time window today (upcoming or missed)
        // 2. Anytime reminders (no scheduledAt)
        // 3. Recurring reminders whose scheduledAt has already been advanced to tomorrow
        //    but which fired today — so the user can see "done today" status
        `(
          r.scheduledAt BETWEEN :start AND :end
          OR r.scheduledAt IS NULL
          OR (r.recurrence != :none AND r.lastFiredAt BETWEEN :start AND :end)
          OR (r.recurrence != :none AND r.scheduledAt < :start)
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
