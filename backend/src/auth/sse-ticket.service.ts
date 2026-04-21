import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

// #7 — Short-lived (60 s), single-use SSE ticket so the long-lived access token
// never appears in URLs (and therefore never in server access logs or browser history).
@Injectable()
export class SseTicketService {
  // Track consumed tickets in-process (sufficient for single-instance; swap for Redis on multi-node)
  private readonly used = new Set<string>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  issue(userId: string): string {
    return this.jwtService.sign(
      { sub: userId, type: 'sse-ticket' },
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: '60s',
      },
    );
  }

  consume(ticket: string): string | null {
    try {
      if (this.used.has(ticket)) return null; // already used
      const payload = this.jwtService.verify<{ sub: string; type: string }>(ticket, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
      if (payload.type !== 'sse-ticket') return null;
      this.used.add(ticket);
      // Prune old entries periodically to avoid unbounded growth
      if (this.used.size > 10_000) this.used.clear();
      return payload.sub;
    } catch {
      return null;
    }
  }
}
