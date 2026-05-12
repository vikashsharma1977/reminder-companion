import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reminder, ReminderStatus, RecurrenceType } from './reminder.entity';
import { User } from '../users/user.entity';
import { EventBusService } from '../notifications/event-bus.service';
import { NotificationsService } from '../notifications/notifications.service';

@Processor('reminders')
export class RemindersProcessor {
  private readonly logger = new Logger(RemindersProcessor.name);

  constructor(
    @InjectRepository(Reminder)
    private readonly reminderRepo: Repository<Reminder>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectQueue('reminders')
    private readonly reminderQueue: Queue,
    private readonly eventBus: EventBusService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Process('fire')
  async handleFire(job: Job<{ reminderId: string }>) {
    const { reminderId } = job.data;

    try {
      const reminder = await this.reminderRepo.findOne({ where: { id: reminderId } });
      if (!reminder || reminder.status !== ReminderStatus.ACTIVE) return;

      // Skip stale jobs — if scheduledAt is >60 s in the future, a snooze or reschedule
      // has already superseded this job (duplicate from recurring next-occurrence queuing)
      if (reminder.scheduledAt && reminder.scheduledAt.getTime() > Date.now() + 60_000) {
        console.log(`[ReminderQueue] Skipping stale job for "${reminder.title}" (scheduledAt is in future)`);
        return;
      }

      // Update lastFiredAt
      reminder.lastFiredAt = new Date();
      await this.reminderRepo.save(reminder);

      // Emit SSE event to the user (web)
      this.eventBus.emit({
        userId: reminder.userId,
        reminderId: reminder.id,
        title: reminder.title,
        scheduledAt: reminder.scheduledAt ? reminder.scheduledAt.toISOString() : null,
        notes: reminder.notes ?? undefined,
      });

      // Send push notification as fallback delivery path (local notifee triggers
      // may not fire on all OEM configurations due to battery optimization).
      const user = await this.userRepo.findOne({ where: { id: reminder.userId } });
      if (user?.fcmToken) {
        await this.notificationsService.sendPush(user.fcmToken, {
          title: reminder.title,
          body: reminder.notes ?? 'Time for your reminder!',
          data: { reminderId: reminder.id },
        }).catch(e => this.logger.warn(`Push failed: ${e}`));
      }

      this.logger.log(`Fired reminder "${reminder.title}" for user ${reminder.userId}`);

      // Schedule first nudge: if not acted on in 10 min, re-alert up to 3 times
      await this.reminderQueue.add(
        'nudge',
        { reminderId: reminder.id, attempt: 1 },
        { delay: 10 * 60 * 1000 },
      );

      // Schedule next occurrence for recurring reminders
      await this.scheduleNextOccurrence(reminder);
    } catch (err) {
      this.logger.error(`Failed to fire reminder ${reminderId}: ${err}`);
    }
  }

  private async scheduleNextOccurrence(reminder: Reminder): Promise<void> {
    if (reminder.recurrence === RecurrenceType.NONE || !reminder.scheduledAt) return;

    const config = reminder.recurrenceConfig;
    const now = new Date(reminder.scheduledAt);

    // Check durationDays limit
    if (config?.durationDays) {
      const createdAt = reminder.createdAt ?? new Date();
      const daysSinceStart = Math.floor(
        (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSinceStart >= config.durationDays) {
        // Duration expired — mark completed
        await this.reminderRepo.update(reminder.id, { status: ReminderStatus.COMPLETED });
        return;
      }
    }

    let nextAt: Date;

    if (reminder.recurrence === RecurrenceType.DAILY) {
      nextAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    } else if (reminder.recurrence === RecurrenceType.WEEKLY) {
      nextAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else {
      return;
    }

    // Update scheduledAt for the next occurrence
    await this.reminderRepo.update(reminder.id, { scheduledAt: nextAt });

    const delay = nextAt.getTime() - Date.now();
    if (delay > 0) {
      await this.reminderQueue.add('fire', { reminderId: reminder.id }, { delay });
      this.logger.log(`Scheduled next occurrence for "${reminder.title}" at ${nextAt.toISOString()}`);
    }
  }

  @Process('nudge')
  async handleNudge(job: Job<{ reminderId: string; attempt: number }>) {
    const { reminderId, attempt } = job.data;
    try {
      const reminder = await this.reminderRepo.findOne({ where: { id: reminderId } });

      // Stop if completed, snoozed (lastFiredAt cleared), or fired too long ago
      if (!reminder || reminder.status !== ReminderStatus.ACTIVE) return;
      if (!reminder.lastFiredAt) return; // snoozed — lastFiredAt was cleared
      const age = Date.now() - reminder.lastFiredAt.getTime();
      if (age > 40 * 60 * 1000) return; // reminder fired >40 min ago — stop nudging

      // Push skipped — local nudge notifications are already scheduled on-device
      // (via syncLocalNotifications). A server push would cause a second vibration
      // interrupting the first, resulting in the same "1s" bug as the fire event.

      this.logger.log(`Nudge ${attempt}/3 for "${reminder.title}" (local notification handles alert)`);

      if (attempt < 3) {
        await this.reminderQueue.add(
          'nudge',
          { reminderId, attempt: attempt + 1 },
          { delay: 10 * 60 * 1000 },
        );
      }
    } catch (err) {
      this.logger.error(`Nudge failed for reminder ${reminderId}: ${err}`);
    }
  }

  @Process('daily-digest')
  async handleDailyDigest(job: Job<{ userId: string; type: 'morning' | 'evening' }>) {
    const { userId, type } = job.data;
    console.log(`[ReminderQueue] Sending ${type} digest to user: ${userId}`);
  }
}
