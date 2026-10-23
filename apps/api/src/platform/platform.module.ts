import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  OnModuleDestroy,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Pool } from 'pg';
import { z } from 'zod';
import { Public } from '../auth/decorators';
import { verifyPassword } from '../auth/password';
import { parse } from '../common/zod';
import { env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import type { Request } from 'express';
type PlatformRequest = Request & { platformActor: string };
@Injectable()
export class PlatformAccess implements CanActivate, OnModuleDestroy {
  private pool = env.PLATFORM_DATABASE_URL
    ? new Pool({ connectionString: env.PLATFORM_DATABASE_URL, max: 3 })
    : null;
  private jwt = new JwtService();
  constructor(private db: DatabaseService) {}
  private ready() {
    if (
      !this.pool ||
      !env.PLATFORM_JWT_SECRET ||
      !env.PLATFORM_ADMIN_USER_IDS ||
      env.PLATFORM_JWT_SECRET === env.JWT_SECRET
    )
      throw new ForbiddenException('Platform administration requires operator configuration');
  }
  private allowed(id: string) {
    return env.PLATFORM_ADMIN_USER_IDS.split(',')
      .map((value) => value.trim())
      .includes(id);
  }
  async login(input: { email: string; password: string }) {
    this.ready();
    if (
      !(
        await this.query('SELECT platform_login_gate($1) AS allowed', [
          createHash('sha256').update(input.email.trim().toLowerCase()).digest('hex'),
        ])
      )[0].allowed
    )
      throw new ForbiddenException('Platform sign-in temporarily limited');
    const user = (
      await this.db.query(
        'SELECT id,password_hash,disabled_at FROM users WHERE lower(email)=lower($1)',
        [input.email],
      )
    ).rows[0];
    if (
      !user ||
      user.disabled_at ||
      !this.allowed(user.id) ||
      !(await verifyPassword(input.password, user.password_hash))
    )
      throw new ForbiddenException('Invalid platform credentials');
    const version = (
      await this.db.query('SELECT session_version,disabled_at FROM users WHERE id=$1', [user.id])
    ).rows[0].session_version;
    return {
      accessToken: await this.jwt.signAsync(
        { sub: user.id, purpose: 'platform', sv: version },
        { secret: env.PLATFORM_JWT_SECRET, expiresIn: 600 },
      ),
      expiresIn: 600,
    };
  }
  async canActivate(context: ExecutionContext) {
    this.ready();
    const req = context.switchToHttp().getRequest<PlatformRequest>();
    try {
      const [scheme, token] = (req.headers.authorization ?? '').split(' ');
      if (scheme !== 'Bearer') throw new Error();
      const payload = await this.jwt.verifyAsync<{ sub: string; purpose: string; sv: number }>(
        token,
        { secret: env.PLATFORM_JWT_SECRET },
      );
      const account = (
        await this.db.query('SELECT session_version,disabled_at FROM users WHERE id=$1', [
          payload.sub,
        ])
      ).rows[0];
      if (
        account?.disabled_at ||
        payload.purpose !== 'platform' ||
        !this.allowed(payload.sub) ||
        account?.session_version !== payload.sv
      )
        throw new Error();
      req.platformActor = payload.sub;
      return true;
    } catch {
      throw new ForbiddenException('Platform session invalid or expired');
    }
  }
  async query(sql: string, params: unknown[] = []) {
    this.ready();
    try {
      return (await this.pool!.query(sql, params)).rows;
    } catch {
      throw new BadRequestException(
        'Platform operation rejected; verify the input and database role configuration',
      );
    }
  }
  async onModuleDestroy() {
    await this.pool?.end();
  }
}
@Public()
@Controller('platform')
class PlatformLoginController {
  constructor(private access: PlatformAccess) {}
  @Post('login') login(@Body() body: unknown) {
    return this.access.login(
      parse(z.object({ email: z.string().email(), password: z.string().min(1).max(128) }), body),
    );
  }
}
@Public()
@UseGuards(PlatformAccess)
@Controller('platform')
class PlatformController {
  constructor(private access: PlatformAccess) {}
  @Get() async snapshot() {
    return (await this.access.query('SELECT platform_snapshot() AS data'))[0].data;
  }
  @Patch('companies/:id') async company(
    @Req() r: PlatformRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({
        name: z.string().trim().min(1).max(120),
        suspended: z.boolean(),
        reason: z.string().trim().min(10).max(1000),
      }),
      body,
    );
    await this.access.query('SELECT platform_change_company($1,$2,$3,$4,$5)', [
      r.platformActor,
      id,
      b.name,
      b.suspended,
      b.reason,
    ]);
    return { updated: true };
  }
  @Patch('subscriptions/:id') async subscription(
    @Req() r: PlatformRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({
        planCode: z.string().min(1).max(50),
        status: z.enum(['active', 'trialing', 'past_due', 'canceled']),
        reason: z.string().trim().min(10).max(1000),
      }),
      body,
    );
    await this.access.query('SELECT platform_change_subscription($1,$2,$3,$4,$5)', [
      r.platformActor,
      id,
      b.planCode,
      b.status,
      b.reason,
    ]);
    return { updated: true, providerUpdated: false };
  }
  @Patch('users/:id') async user(
    @Req() r: PlatformRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({
        name: z.string().trim().min(1).max(120),
        disabled: z.boolean(),
        reason: z.string().trim().min(10).max(1000),
      }),
      body,
    );
    await this.access.query('SELECT platform_change_user($1,$2,$3,$4,$5)', [
      r.platformActor,
      id,
      b.name,
      b.disabled,
      b.reason,
    ]);
    return { updated: true };
  }
  @Post('users/:id/revoke-sessions') async revoke(
    @Req() r: PlatformRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ reason: z.string().trim().min(10).max(1000) }), body);
    await this.access.query('SELECT platform_revoke_user($1,$2,$3)', [
      r.platformActor,
      id,
      b.reason,
    ]);
    return { revoked: true };
  }
  @Patch('plans/:code') async plan(
    @Req() r: PlatformRequest,
    @Param('code') code: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({
        name: z.string().min(1).max(100),
        enabled: z.boolean(),
        limits: z.record(z.number().int().min(-1).max(1000000000)),
        features: z.record(z.boolean()),
        reason: z.string().trim().min(10).max(1000),
      }),
      body,
    );
    await this.access.query('SELECT platform_change_plan($1,$2,$3,$4,$5,$6,$7)', [
      r.platformActor,
      code,
      b.name,
      b.enabled,
      JSON.stringify(b.limits),
      JSON.stringify(b.features),
      b.reason,
    ]);
    return { updated: true };
  }
}
@Module({ controllers: [PlatformLoginController, PlatformController], providers: [PlatformAccess] })
export class PlatformModule {}
