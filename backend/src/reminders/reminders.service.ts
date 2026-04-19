import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Reminder, ReminderStatus } from './reminder.entity';
import { CreateReminderDto } from './dto/create-reminder.dto';

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
    reminder.status = ReminderStatus.COMPLETED;
    return this.reminderRepo.save(reminder);
  }

  async markMissed(id: string): Promise<void> {
    await this.reminderRepo.increment({ id }, 'missedCount', 1);
    await this.reminderRepo.update(id, { lastFiredAt: new Date() });
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
      .andWhere('r.scheduledAt BETWEEN :start AND :end', { start, end })
      .andWhere('r.status = :status', { status: ReminderStatus.ACTIVE })
      .orderBy('r.scheduledAt', 'ASC')
      .getMany();
  }

  async getFrequentlyMissed(userId: string): Promise<Reminder[]> {
    return this.reminderRepo.find({
      where: { userId, status: ReminderStatus.ACTIVE },
      order: { missedCount: 'DESC' },
      take: 5,
    });
  }
}
