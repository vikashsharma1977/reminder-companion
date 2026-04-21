import {
  Controller, Sse, Query, UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { EventBusService } from './event-bus.service';
import { SseTicketService } from '../auth/sse-ticket.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly eventBus: EventBusService,
    private readonly sseTicketService: SseTicketService,
  ) {}

  // #7 — Accepts a one-time 60 s ticket (not the long-lived access token).
  // Frontend obtains a ticket via POST /auth/sse-ticket before connecting.
  @Sse('stream')
  stream(@Query('ticket') ticket: string): Observable<MessageEvent> {
    const userId = this.sseTicketService.consume(ticket);
    if (!userId) throw new UnauthorizedException('Invalid or expired SSE ticket');

    return this.eventBus.forUser(userId).pipe(
      map(({ userId: _uid, ...payload }) => ({ data: payload }) as MessageEvent),
    );
  }
}
