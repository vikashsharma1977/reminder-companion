import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { RemindersService } from './reminders.service';
import { NotificationsService } from '../notifications/notifications.service';

@Processor('reminders')
export class RemindersProcessor {
  constructor(
    private readonly remindersService: RemindersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Process('fire')
  async handleFire(job: Job<{ reminderId: string }>) {
    const { reminderId } = job.data;

    try {
      // In a real app, fetch reminder + user FCM token and send push
      console.log(`[ReminderQueue] Firing reminder: ${reminderId}`);
      await this.remindersService.markMissed(reminderId);
      // TODO: integrate FCM push here once NotificationsService is wired
    } catch (err) {
      console.error(`[ReminderQueue] Failed to fire reminder ${reminderId}:`, err);
    }
  }

  @Process('daily-digest')
  async handleDailyDigest(job: Job<{ userId: string; type: 'morning' | 'evening' }>) {
    const { userId, type } = job.data;
    console.log(`[ReminderQueue] Sending ${type} digest to user: ${userId}`);
    // TODO: fetch today's reminders and send push notification summary
  }
}
