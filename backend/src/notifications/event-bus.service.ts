import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface ReminderFiredEvent {
  userId: string;
  reminderId: string;
  title: string;
  scheduledAt: string | null;
  notes?: string;
}

@Injectable()
export class EventBusService {
  private readonly subject = new Subject<ReminderFiredEvent>();

  emit(event: ReminderFiredEvent): void {
    this.subject.next(event);
  }

  forUser(userId: string): Observable<ReminderFiredEvent> {
    return this.subject.pipe(filter((e) => e.userId === userId));
  }
}
