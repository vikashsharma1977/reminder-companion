import {
  Controller, Sse, Post, Body, Query, Request, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { IsString, IsNotEmpty } from 'class-validator';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { EventBusService } from './event-bus.service';
import { SseTicketService } from '../auth/sse-ticket.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';

class RegisterTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly eventBus: EventBusService,
    private readonly sseTicketService: SseTicketService,
    private readonly usersService: UsersService,
  ) {}

  @Post('register-token')
  @UseGuards(JwtAuthGuard)
  async registerToken(
    @Request() req: { user: { id: string } },
    @Body() dto: RegisterTokenDto,
  ): Promise<void> {
    await this.usersService.updateFcmToken(req.user.id, dto.token);
  }

  @Sse('stream')
  stream(@Query('ticket') ticket: string): Observable<MessageEvent> {
    const userId = this.sseTicketService.consume(ticket);
    if (!userId) throw new UnauthorizedException('Invalid or expired SSE ticket');

    return this.eventBus.forUser(userId).pipe(
      map(({ userId: _uid, ...payload }) => ({ data: payload }) as MessageEvent),
    );
  }
}
