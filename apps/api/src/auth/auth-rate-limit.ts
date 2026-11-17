import { HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuthRateLimit {
  constructor(private readonly db: DatabaseService) {}
  async consume(action: string, identity: string, request: Request, limit: number) {
    // Never trust client-controlled forwarding headers. The transport counter is
    // deliberately broad for shared proxies; identity counters remain independent.
    for (const [key, maximum] of [
      ['transport:' + (request.socket.remoteAddress ?? 'unknown'), 300],
      [action + ':' + identity.trim().toLowerCase(), limit],
    ] as const) {
      const hash = createHash('sha256').update(key).digest('hex');
      const result = await this.db.query<{ allowed: boolean }>(
        'SELECT auth_consume_rate_limit($1,$2,300) AS allowed', [hash, maximum],
      );
      if (!result.rows[0]?.allowed)
        throw new HttpException('Too many authentication attempts; try again in five minutes', 429);
    }
  }
}
