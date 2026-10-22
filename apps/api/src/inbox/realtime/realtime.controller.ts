import {
  Controller,
  Headers,
  MessageEvent,
  Post,
  Query,
  Req,
  Sse,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Observable } from 'rxjs';
import { Public } from '../../auth/decorators';
import { AuthedRequest } from '../../common/types';
import { DatabaseService } from '../../database/database.service';
@Controller('realtime')
export class RealtimeController {
  constructor(
    private jwt: JwtService,
    private db: DatabaseService,
  ) {}
  @Post('ticket') async ticket(@Req() req: AuthedRequest) {
    return {
      ticket: await this.jwt.signAsync(
        { sub: req.user.userId, tid: req.user.tenantId, purpose: 'sse' },
        { expiresIn: 60 },
      ),
    };
  }
  @Public()
  @Sse('stream')
  stream(
    @Query('ticket') ticket: string,
    @Query('after') after?: string,
    @Headers('last-event-id') last?: string,
  ): Observable<MessageEvent> {
    let p: { sub: string; tid: string; purpose: string };
    try {
      p = this.jwt.verify(ticket);
      if (p.purpose !== 'sse') throw new Error();
    } catch {
      throw new UnauthorizedException('Invalid stream ticket');
    }
    return new Observable((sub) => {
      let cursor = /^\d+$/.test(last || after || '') ? last || after : null;
      let stopped = false;
      let busy = false;
      const poll = async () => {
        if (stopped || busy) return;
        busy = true;
        try {
          const rows = await this.db.withTenant(p.tid, async (c) => {
            if (!(await c.query('SELECT 1 FROM memberships WHERE user_id=$1', [p.sub])).rowCount)
              throw new UnauthorizedException('Membership removed');
            if (cursor === null) {
              cursor = (await c.query('SELECT COALESCE(max(id),0)::text AS id FROM stream_events'))
                .rows[0].id;
            }
            return (
              await c.query(
                'SELECT id::text,payload FROM stream_events WHERE id>$1 ORDER BY id LIMIT 100',
                [cursor],
              )
            ).rows;
          });
          for (const row of rows) {
            if (stopped) break;
            cursor = row.id;
            sub.next({ id: row.id, type: row.payload.type, data: row.payload });
          }
        } catch (e) {
          sub.error(e);
        } finally {
          busy = false;
        }
      };
      void poll();
      const timer = setInterval(() => void poll(), 1000);
      return () => {
        stopped = true;
        clearInterval(timer);
      };
    });
  }
}
