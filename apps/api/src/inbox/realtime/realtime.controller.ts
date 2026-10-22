import { Controller, HttpException, MessageEvent, Post, Query, Req, Sse, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { interval, map, merge, Observable } from 'rxjs';
import { Public } from '../../auth/decorators';
import { AuthedRequest } from '../../common/types';
import { RealtimeService } from './realtime.service';

const MAX_STREAMS_PER_TENANT = 200;

@Controller('realtime')
export class RealtimeController {
  constructor(
    private readonly jwt: JwtService,
    private readonly rt: RealtimeService,
  ) {}

  /** EventSource لا يرسل Authorization header، فنصدر تذكرة قصيرة العمر (60 ثانية) تُستخدم مرة عند الاتصال */
  @Post('ticket')
  async ticket(@Req() req: AuthedRequest) {
    const ticket = await this.jwt.signAsync(
      { sub: req.user.userId, tid: req.user.tenantId, role: req.user.role, purpose: 'sse' },
      { expiresIn: 60 },
    );
    return { ticket };
  }

  @Public() @Sse('stream')
  stream(@Query('ticket') ticket: string): Observable<MessageEvent> {
    let tenantId: string;
    try {
      const p = this.jwt.verify<{ tid: string; purpose?: string }>(ticket ?? '');
      if (p.purpose !== 'sse') throw new Error('bad purpose');
      tenantId = p.tid;
    } catch {
      throw new UnauthorizedException('Invalid or expired ticket');
    }
    if (this.rt.bus.size(tenantId) >= MAX_STREAMS_PER_TENANT) throw new HttpException('Too many open streams', 429);

    const events$ = new Observable<MessageEvent>((sub) =>
      this.rt.bus.subscribe(tenantId, (e) => sub.next({ type: e.type, data: e })),
    );
    const ping$ = interval(25000).pipe(map(() => ({ type: 'ping', data: {} }) as MessageEvent));
    return merge(events$, ping$);
  }
}
