import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly config: ConfigService) {}

  async sendPush(fcmToken: string, payload: PushPayload): Promise<void> {
    const fcmKey = this.config.get<string>('FCM_SERVER_KEY');

    if (!fcmKey) {
      // Dev mode: just log the notification
      this.logger.log(`[DEV PUSH] → ${fcmToken?.slice(0, 8)}... | ${payload.title}: ${payload.body}`);
      return;
    }

    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        Authorization: `key=${fcmKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: fcmToken,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
      }),
    });

    if (!response.ok) {
      this.logger.error(`FCM push failed: ${response.status}`);
    }
  }

  async sendMorningDigest(fcmToken: string, count: number): Promise<void> {
    await this.sendPush(fcmToken, {
      title: 'Good morning!',
      body: `You have ${count} reminder${count !== 1 ? 's' : ''} today.`,
      data: { type: 'morning_digest' },
    });
  }

  async sendEveningRecap(fcmToken: string, missedCount: number): Promise<void> {
    if (missedCount === 0) return;
    await this.sendPush(fcmToken, {
      title: 'Evening recap',
      body: `${missedCount} reminder${missedCount !== 1 ? 's' : ''} missed today — reschedule?`,
      data: { type: 'evening_recap' },
    });
  }

  async sendSmartSuggestion(fcmToken: string, reminderTitle: string): Promise<void> {
    await this.sendPush(fcmToken, {
      title: 'You keep skipping this',
      body: `"${reminderTitle}" — change time or make it recurring?`,
      data: { type: 'smart_suggestion' },
    });
  }
}
