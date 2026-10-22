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

    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        tid: string;
        role: Role;
        purpose?: string;
      }>(token);
      if (payload.purpose) throw new Error('Not an access token');
      req.user = { userId: payload.sub, tenantId: payload.tid, role: payload.role };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

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
