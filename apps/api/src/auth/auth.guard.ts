import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthedRequest, Role } from '../common/types';
import { DatabaseService } from '../database/database.service';
import { IS_PUBLIC, ROLES_KEY } from './decorators';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Missing token');

    let sessionVersion = 0,
      sessionId: string | undefined;
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        tid: string;
        role: Role;
        purpose?: string;
        sv?: number;
        sid?: string;
      }>(token);
      sessionVersion = payload.sv ?? 0;
      sessionId = payload.sid;
      if (payload.purpose) throw new Error('Not an access token');
      req.user = { userId: payload.sub, tenantId: payload.tid, role: payload.role };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const account = (
      await this.db.query('SELECT session_version,disabled_at FROM users WHERE id=$1', [
        req.user.userId,
      ])
    ).rows[0];
    if (!account || account.disabled_at || account.session_version !== sessionVersion)
      throw new UnauthorizedException('Session revoked');
    if (
      sessionId &&
      !(
        await this.db.query(
          'SELECT 1 FROM refresh_tokens WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now()',
          [sessionId, req.user.userId],
        )
      ).rowCount
    )
      throw new UnauthorizedException('Session revoked');
    const suspended = await this.db.withTenant(
      req.user.tenantId,
      async (c) => (await c.query('SELECT suspended_at FROM tenants')).rows[0]?.suspended_at,
    );
    if (suspended)
      throw new ForbiddenException('Workspace suspended; contact the platform operator');
    if(sessionId)await this.db.query("UPDATE refresh_tokens SET device_label=CASE WHEN device_label='' THEN $3 ELSE device_label END,last_seen_at=now() WHERE id=$1 AND user_id=$2 AND(last_seen_at IS NULL OR last_seen_at<now()-interval '1 minute')",[sessionId,req.user.userId,String(req.headers['user-agent']??'Unknown device').slice(0,200)]);
    req.user.sessionId = sessionId;
    req.user.sessionVersion = sessionVersion;
    // Membership is authoritative: role changes/removal take effect immediately.
    const member = await this.db.withTenant(
      req.user.tenantId,
      async (c) =>
        (
          await c.query<{ role: Role }>('SELECT role FROM memberships WHERE user_id = $1', [
            req.user.userId,
          ])
        ).rows[0],
    );
    if (!member) throw new ForbiddenException('Membership removed');
    req.user.role = member.role;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (roles && !roles.includes(req.user.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
