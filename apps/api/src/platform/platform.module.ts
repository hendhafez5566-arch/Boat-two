import { CryptoService } from '../messaging/crypto.service';
import { matchingTotpStep, newTotpSecret } from './totp';
import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { stepUpDigest } from './step-up';
import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Header,
  Injectable,
  Module,
  OnModuleDestroy,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Query,
  UseGuards,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { operatorPermissions, PlatformPermission } from './permissions';
import { JwtService } from '@nestjs/jwt';
import { Pool } from 'pg';
import { z } from 'zod';
import { Public } from '../auth/decorators';
import { verifyPassword } from '../auth/password';
import { parse } from '../common/zod';
import { env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import type { Request } from 'express';
type PlatformRequest = Request & {
  platformActor: string;
  platformVersion: number;
  platformPermissions: PlatformPermission[];
};
const Permission = (value: PlatformPermission) => SetMetadata('platform.permission', value);
@Injectable()
export class PlatformAccess implements CanActivate, OnModuleDestroy {
  private pool = env.PLATFORM_DATABASE_URL
    ? new Pool({ connectionString: env.PLATFORM_DATABASE_URL, max: 3 })
    : null;
  private jwt = new JwtService();
  private crypto = new CryptoService();
  constructor(
    private db: DatabaseService,
    private reflector: Reflector,
  ) {}
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
  async login(input: { email: string; password: string; otp?: string }) {
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
    const account = (
      await this.db.query('SELECT session_version,disabled_at FROM users WHERE id=$1', [user.id])
    ).rows[0];
    if (!account || account.disabled_at)
      throw new ForbiddenException('Invalid platform credentials');
    const state = await this.mfaState(user.id);
    if (!state?.enabled) {
      const secret = newTotpSecret(),
        encrypted = this.crypto.encrypt({ secret });
      const begun = (
        await this.query('SELECT platform_mfa_begin($1,$2) AS ok', [user.id, encrypted])
      )[0].ok;
      if (!begun) throw new ForbiddenException('MFA state changed; sign in again');
      return {
        requiresEnrollment: true,
        secret,
        provisioningUri:
          'otpauth://totp/' +
          encodeURIComponent('ELHAFEZ BOAT:' + input.email) +
          '?' +
          new URLSearchParams({
            secret,
            issuer: 'ELHAFEZ BOAT',
            algorithm: 'SHA1',
            digits: '6',
            period: '30',
          }),
        setupToken: await this.jwt.signAsync(
          {
            sub: user.id,
            purpose: 'platform-mfa-enroll',
            sv: account.session_version,
            ref: createHash('sha256').update(encrypted).digest('hex'),
          },
          { secret: env.PLATFORM_JWT_SECRET, expiresIn: 300 },
        ),
      };
    }
    if (!input.otp) return { requiresMfa: true };
    await this.consumeMfa(user.id, state, input.otp, false);
    return this.session(user.id, account.session_version);
  }
  private async session(id: string, version: number) {
    return {
      accessToken: await this.jwt.signAsync(
        { sub: id, purpose: 'platform', sv: version, mfa: true },
        { secret: env.PLATFORM_JWT_SECRET, expiresIn: 600 },
      ),
      expiresIn: 600,
    };
  }
  private async mfaState(id: string): Promise<{ secret_enc: string; enabled: boolean } | null> {
    return (await this.query('SELECT platform_mfa_state($1) AS data', [id]))[0].data;
  }
  private async consumeMfa(
    id: string,
    state: { secret_enc: string },
    otp: string,
    enroll: boolean,
  ) {
    const secret = this.crypto.decrypt<{ secret: string }>(state.secret_enc).secret;
    const step = matchingTotpStep(secret, otp);
    if (
      step === null ||
      !(
        await this.query('SELECT platform_mfa_consume($1,$2,$3,$4) AS ok', [
          id,
          state.secret_enc,
          step,
          enroll,
        ])
      )[0].ok
    )
      throw new ForbiddenException(
        'MFA code invalid, expired or already used; wait for a new code',
      );
  }
  async enroll(input: { setupToken: string; otp: string }) {
    this.ready();
    let payload: { sub: string; purpose: string; sv: number; ref: string };
    try {
      payload = await this.jwt.verifyAsync(input.setupToken, { secret: env.PLATFORM_JWT_SECRET });
    } catch {
      throw new ForbiddenException('Enrollment expired; sign in again');
    }
    if (payload.purpose !== 'platform-mfa-enroll' || !this.allowed(payload.sub))
      throw new ForbiddenException('Invalid enrollment');
    if (
      !(await this.query('SELECT platform_login_gate($1) AS allowed', ['mfa:' + payload.sub]))[0]
        .allowed
    )
      throw new ForbiddenException('Enrollment temporarily limited');
    const user = (
      await this.db.query('SELECT session_version,disabled_at FROM users WHERE id=$1', [
        payload.sub,
      ])
    ).rows[0];
    const state = await this.mfaState(payload.sub);
    if (
      !user ||
      user.disabled_at ||
      user.session_version !== payload.sv ||
      !state ||
      state.enabled ||
      createHash('sha256').update(state.secret_enc).digest('hex') !== payload.ref
    )
      throw new ForbiddenException('Invalid enrollment; sign in again');
    await this.consumeMfa(payload.sub, state, input.otp, true);
    return this.session(payload.sub, user.session_version);
  }
  async canActivate(context: ExecutionContext) {
    this.ready();
    const req = context.switchToHttp().getRequest<PlatformRequest>();
    try {
      const [scheme, token] = (req.headers.authorization ?? '').split(' ');
      if (scheme !== 'Bearer') throw new Error();
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        purpose: string;
        sv: number;
        mfa?: boolean;
      }>(token, { secret: env.PLATFORM_JWT_SECRET });
      const account = (
        await this.db.query('SELECT session_version,disabled_at FROM users WHERE id=$1', [
          payload.sub,
        ])
      ).rows[0];
      if (
        account?.disabled_at ||
        payload.purpose !== 'platform' ||
        payload.mfa !== true ||
        !this.allowed(payload.sub) ||
        account?.session_version !== payload.sv
      )
        throw new Error();
      if (!(await this.mfaState(payload.sub))?.enabled) throw new Error();
      req.platformActor = payload.sub;
      req.platformVersion = payload.sv;
      req.platformPermissions = operatorPermissions(env.PLATFORM_OPERATOR_ROLES, payload.sub);
      const required = this.reflector.getAllAndOverride<PlatformPermission>('platform.permission', [
        context.getHandler(),
        context.getClass(),
      ]);
      if (required && !req.platformPermissions.includes(required)) throw new Error();
      if (
        required &&
        (required.endsWith('.write') || required === 'sessions.revoke' || required === 'mfa.manage')
      ) {
        const grant = await this.jwt.verifyAsync<{
          sub: string;
          sv: number;
          purpose: string;
          digest: string;
          nonce: string;
        }>(String(req.headers['x-platform-step-up'] ?? ''), { secret: env.PLATFORM_JWT_SECRET });
        if (
          grant.purpose !== 'platform-step-up' ||
          grant.sub !== payload.sub ||
          grant.sv !== payload.sv ||
          grant.digest !== stepUpDigest(req.method, req.path, req.body)
        )
          throw new Error();
        if (
          !(
            await this.query('SELECT platform_consume_step_up($1,$2) AS ok', [
              payload.sub,
              grant.nonce,
            ])
          )[0].ok
        )
          throw new Error();
      }
      return true;
    } catch {
      throw new ForbiddenException('Platform session invalid or expired');
    }
  }
  async backupCodes(actor: string) {
    const codes = Array.from({ length: 8 }, () => randomBytes(24).toString('base64url'));
    await this.query('SELECT platform_replace_recovery_codes($1,$2)', [
      actor,
      JSON.stringify(codes.map((code) => createHash('sha256').update(code).digest('hex'))),
    ]);
    return { codes, displayOnce: true };
  }
  async recover(input: { email: string; password: string; recoveryCode: string }) {
    this.ready();
    if (
      !(
        await this.query('SELECT platform_login_gate($1) AS allowed', [
          'recover:' + createHash('sha256').update(input.email.trim().toLowerCase()).digest('hex'),
        ])
      )[0].allowed
    )
      throw new ForbiddenException('Recovery temporarily limited');
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
      throw new ForbiddenException('Invalid recovery credentials');
    const secret = newTotpSecret(),
      encrypted = this.crypto.encrypt({ secret });
    const version = (
      await this.query('SELECT platform_recover_mfa($1,$2,$3) AS version', [
        user.id,
        createHash('sha256').update(input.recoveryCode).digest('hex'),
        encrypted,
      ])
    )[0].version;
    if (version === null) throw new ForbiddenException('Invalid recovery credentials');
    return {
      requiresEnrollment: true,
      secret,
      provisioningUri:
        'otpauth://totp/' +
        encodeURIComponent('ELHAFEZ BOAT:' + input.email) +
        '?' +
        new URLSearchParams({
          secret,
          issuer: 'ELHAFEZ BOAT',
          algorithm: 'SHA1',
          digits: '6',
          period: '30',
        }),
      setupToken: await this.jwt.signAsync(
        {
          sub: user.id,
          purpose: 'platform-mfa-enroll',
          sv: version,
          ref: createHash('sha256').update(encrypted).digest('hex'),
        },
        { secret: env.PLATFORM_JWT_SECRET, expiresIn: 300 },
      ),
    };
  }
  async stepUp(
    r: PlatformRequest,
    input: { otp: string; method: string; path: string; body?: unknown },
  ) {
    if (
      !(
        await this.query('SELECT platform_login_gate($1) AS allowed', [
          'step-up:' + r.platformActor,
        ])
      )[0].allowed
    )
      throw new ForbiddenException('Step-up temporarily limited');
    const state = await this.mfaState(r.platformActor);
    if (!state?.enabled) throw new ForbiddenException('Authenticator required');
    await this.consumeMfa(r.platformActor, state, input.otp, false);
    return {
      stepUpToken: await this.jwt.signAsync(
        {
          sub: r.platformActor,
          sv: r.platformVersion,
          purpose: 'platform-step-up',
          nonce: randomUUID(),
          digest: stepUpDigest(input.method, input.path, input.body),
        },
        { secret: env.PLATFORM_JWT_SECRET, expiresIn: 120 },
      ),
      expiresIn: 120,
    };
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
  @Header('Cache-Control', 'no-store')
  @Post('mfa/enroll')
  enroll(@Body() body: unknown) {
    return this.access.enroll(
      parse(
        z.object({ setupToken: z.string().max(3000), otp: z.string().regex(/^[0-9]{6}$/) }),
        body,
      ),
    );
  }
  @Header('Cache-Control', 'no-store') @Post('mfa/recover') recover(@Body() body: unknown) {
    return this.access.recover(
      parse(
        z.object({
          email: z.string().email(),
          password: z.string().min(1).max(128),
          recoveryCode: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
        }),
        body,
      ),
    );
  }
  @Header('Cache-Control', 'no-store')
  @Post('login')
  login(@Body() body: unknown) {
    return this.access.login(
      parse(
        z.object({
          email: z.string().email(),
          password: z.string().min(1).max(128),
          otp: z
            .string()
            .regex(/^[0-9]{6}$/)
            .optional(),
        }),
        body,
      ),
    );
  }
}
@Public()
@UseGuards(PlatformAccess)
@Controller('platform')
class PlatformController {
  constructor(private access: PlatformAccess) {}
  @Get('session') session(@Req() r: PlatformRequest) {
    return { actor: r.platformActor, permissions: r.platformPermissions };
  }
  @Permission('reports.read') @Get('reports') async reports(@Query() query: unknown) {
    const q = parse(z.object({ from: z.string().datetime(), to: z.string().datetime() }), query);
    if (
      Date.parse(q.to) <= Date.parse(q.from) ||
      Date.parse(q.to) - Date.parse(q.from) > 366 * 86400000
    )
      throw new BadRequestException('Report range must be positive and at most 366 days');
    return (
      await this.access.query('SELECT platform_operational_report($1,$2) AS data', [q.from, q.to])
    )[0].data;
  }
  @Permission('audit.read')
  @Get('audit')
  async audit(@Query() query: unknown) {
    const q = parse(
      z.object({
        actor: z.string().uuid().optional(),
        tenant: z.string().uuid().optional(),
        action: z.string().max(100).default(''),
        from: z.string().datetime(),
        to: z.string().datetime(),
        cursor: z
          .string()
          .regex(/^[1-9][0-9]{0,18}$/)
          .optional(),
        limit: z.coerce.number().int().min(1).max(500).default(50),
      }),
      query,
    );
    if (
      Date.parse(q.to) <= Date.parse(q.from) ||
      Date.parse(q.to) - Date.parse(q.from) > 366 * 86400000
    )
      throw new BadRequestException('Audit range must be positive and at most 366 days');
    return (
      await this.access.query('SELECT platform_audit_page($1,$2,$3,$4,$5,$6,$7) AS data', [
        q.actor ?? null,
        q.tenant ?? null,
        q.action,
        q.from,
        q.to,
        q.cursor ?? null,
        q.limit,
      ])
    )[0].data;
  }
  @Get('directory') async directory(@Req() r: PlatformRequest, @Query() query: unknown) {
    const q = parse(
      z.object({
        kind: z.enum(['companies', 'users']),
        q: z.string().max(100).default(''),
        page: z.coerce.number().int().min(1).max(100000).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
      query,
    );
    if (!r.platformPermissions.includes(q.kind === 'users' ? 'users.read' : 'companies.read'))
      throw new ForbiddenException('Directory read scope required');
    return (
      await this.access.query('SELECT platform_directory($1,$2,$3,$4) AS data', [
        q.kind,
        q.q,
        q.page,
        q.limit,
      ])
    )[0].data;
  }
  @Get() async snapshot(@Req() r: PlatformRequest) {
    const snapshot = (await this.access.query('SELECT platform_snapshot() AS data'))[0].data;
    return {
      companies: r.platformPermissions.includes('companies.read') ? snapshot.companies : [],
      users: r.platformPermissions.includes('users.read') ? snapshot.users : [],
      plans: r.platformPermissions.includes('plans.read') ? snapshot.plans : [],
      audit: r.platformPermissions.includes('audit.read') ? snapshot.audit : [],
    };
  }
  @Permission('mfa.manage') @Post('mfa/backup-codes') codes(@Req() r: PlatformRequest) {
    return this.access.backupCodes(r.platformActor);
  }
  @Post('step-up') stepUp(@Req() r: PlatformRequest, @Body() body: unknown) {
    return this.access.stepUp(
      r,
      parse(
        z.object({
          otp: z.string().regex(/^[0-9]{6}$/),
          method: z.enum(['POST', 'PATCH', 'DELETE']),
          path: z.string().startsWith('/platform/').max(500),
          body: z.unknown().optional(),
        }),
        body,
      ),
    );
  }
  @Permission('companies.write')
  @Patch('companies/:id')
  async company(
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
  @Permission('subscriptions.write')
  @Patch('subscriptions/:id')
  async subscription(
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
  @Permission('users.write')
  @Patch('users/:id')
  async user(
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
  @Permission('sessions.revoke')
  @Post('users/:id/revoke-sessions')
  async revoke(
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
  @Permission('plans.read')
  @Get('prices')
  async prices() {
    return (await this.access.query('SELECT platform_price_catalog() AS data'))[0].data;
  }
  @Permission('plans.write') @Post('prices') async publishPrice(
    @Req() r: PlatformRequest,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({
        planCode: z.string().min(1).max(50),
        priceId: z
          .string()
          .regex(/^price_[A-Za-z0-9_]+$/)
          .max(255),
        amountCents: z.number().int().min(1).max(1000000000),
        currency: z.string().regex(/^[a-z]{3}$/),
        interval: z.enum(['month', 'year']),
        reason: z.string().trim().min(10).max(1000),
      }),
      body,
    );
    await this.access.query('SELECT platform_publish_price($1,$2,$3,$4,$5,$6,$7)', [
      r.platformActor,
      b.planCode,
      b.priceId,
      b.amountCents,
      b.currency,
      b.interval,
      b.reason,
    ]);
    return { updated: true, providerUpdated: false };
  }
  @Permission('plans.write') @Post('prices/:id/retire') async retirePrice(
    @Req() r: PlatformRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ reason: z.string().trim().min(10).max(1000) }), body);
    parse(
      z
        .string()
        .regex(/^price_[A-Za-z0-9_]+$/)
        .max(255),
      id,
    );
    await this.access.query('SELECT platform_retire_price($1,$2,$3)', [
      r.platformActor,
      id,
      b.reason,
    ]);
    return { updated: true, providerUpdated: false };
  }
  @Permission('plans.write')
  @Patch('plans/:code')
  async plan(@Req() r: PlatformRequest, @Param('code') code: string, @Body() body: unknown) {
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
