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
        {
          sub: req.user.userId,
          tid: req.user.tenantId,
          purpose: 'sse',
          sid: req.user.sessionId,
          sv: req.user.sessionVersion,
        },
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
    let p: { sub: string; tid: string; purpose: string; sid?: string; sv?: number; exp: number };
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
            if (
              !(
                await c.query(
                  `SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id
              WHERE m.user_id=$1 AND u.session_version=$2 AND u.disabled_at IS NULL AND t.suspended_at IS NULL`,
                  [p.sub, p.sv ?? 0],
                )
              ).rowCount
            )
              throw new UnauthorizedException('Stream access revoked');
            if (
              p.sid &&
              !(
                await c.query(
                  'SELECT 1 FROM refresh_tokens WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now()',
                  [p.sid, p.sub],
                )
              ).rowCount
            )
              throw new UnauthorizedException('Stream session revoked');
            if (!p.sid && p.exp * 1000 < Date.now())
              throw new UnauthorizedException('Legacy stream ticket expired');
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
