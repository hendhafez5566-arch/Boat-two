import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { Role } from '../common/types';
import { DatabaseService } from '../database/database.service';
import { hashPassword, verifyPassword } from './password';

interface Workspace {
  tenant_id: string;
  role: Role;
  name: string;
  slug: string;
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const TRIAL_PLAN = 'pro';

function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'workspace'}-${randomBytes(2).toString('hex')}`;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
  ) {}

  private async workspaces(userId: string): Promise<Workspace[]> {
    const r = await this.db.query<Workspace>('SELECT * FROM auth_user_memberships($1)', [userId]);
    return r.rows;
  }

  private async issueTokens(userId: string, tenantId: string, role: Role) {
    const accessToken = await this.jwt.signAsync({ sub: userId, tid: tenantId, role });
    const refreshToken = randomBytes(32).toString('hex');
    await this.db.query(
      `INSERT INTO refresh_tokens (user_id, tenant_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + ($4 || ' days')::interval)`,
      [userId, tenantId, sha256(refreshToken), String(env.REFRESH_TTL_DAYS)],
    );
    return { accessToken, refreshToken, expiresIn: env.JWT_ACCESS_TTL_SECONDS };
  }

  async register(input: { email: string; password: string; fullName: string; workspaceName: string }) {
    const email = input.email.toLowerCase();
    const tenantId = randomUUID();
    const userId = randomUUID();
    const passwordHash = await hashPassword(input.password);

    try {
      await this.db.withTenant(tenantId, async (c) => {
        await c.query('INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)', [
          tenantId,
          input.workspaceName,
          slugify(input.workspaceName),
        ]);
        await c.query(
          'INSERT INTO users (id, email, password_hash, full_name) VALUES ($1, $2, $3, $4)',
          [userId, email, passwordHash, input.fullName],
        );
        await c.query(
          "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'owner')",
          [tenantId, userId],
        );
        await c.query(
          `INSERT INTO subscriptions (tenant_id, plan_id, status, trial_ends_at)
           SELECT $1, id, 'trialing', now() + ($3 || ' days')::interval FROM plans WHERE code = $2`,
          [tenantId, TRIAL_PLAN, String(env.TRIAL_DAYS)],
        );
      });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw new ConflictException('Email already registered');
      }
      throw e;
    }

    const tokens = await this.issueTokens(userId, tenantId, 'owner');
    return { ...tokens, tenantId, role: 'owner' as Role };
  }

  async login(input: { email: string; password: string; tenantId?: string }) {
    const r = await this.db.query<{ id: string; password_hash: string | null }>(
      'SELECT id, password_hash FROM users WHERE email = $1',
      [input.email.toLowerCase()],
    );
    const user = r.rows[0];
    const ok = await verifyPassword(input.password, user?.password_hash ?? null);
    if (!user || !ok) throw new UnauthorizedException('Invalid email or password');

    const spaces = await this.workspaces(user.id);
    const chosen = input.tenantId ? spaces.find((s) => s.tenant_id === input.tenantId) : spaces[0];
    if (!chosen) throw new ForbiddenException('No workspace for this user');

    const tokens = await this.issueTokens(user.id, chosen.tenant_id, chosen.role);
    return { ...tokens, tenantId: chosen.tenant_id, role: chosen.role, workspaces: spaces };
  }

  async refresh(refreshToken: string) {
    const hash = sha256(refreshToken);
    const r = await this.db.query<{ id: string; user_id: string; tenant_id: string }>(
      `SELECT id, user_id, tenant_id FROM refresh_tokens
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [hash],
    );
    const row = r.rows[0];
    if (!row) throw new UnauthorizedException('Invalid refresh token');

    const space = (await this.workspaces(row.user_id)).find((s) => s.tenant_id === row.tenant_id);
    if (!space) throw new ForbiddenException('Membership removed');

    await this.db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [row.id]);
    return this.issueTokens(row.user_id, row.tenant_id, space.role);
  }

  async logout(refreshToken: string) {
    await this.db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1', [
      sha256(refreshToken),
    ]);
  }

  async switchTenant(userId: string, tenantId: string) {
    const space = (await this.workspaces(userId)).find((s) => s.tenant_id === tenantId);
    if (!space) throw new ForbiddenException('Not a member of this workspace');
    const tokens = await this.issueTokens(userId, tenantId, space.role);
    return { ...tokens, tenantId, role: space.role };
  }

  async me(userId: string) {
    const r = await this.db.query(
      'SELECT id, email, full_name, created_at FROM users WHERE id = $1',
      [userId],
    );
    return { user: r.rows[0], workspaces: await this.workspaces(userId) };
  }

  async acceptInvitation(input: { token: string; password: string; fullName: string }) {
    const found = await this.db.query<{
      id: string;
      tenant_id: string;
      email: string;
      role: Role;
      expires_at: Date;
      accepted_at: Date | null;
    }>('SELECT * FROM auth_find_invitation($1)', [sha256(input.token)]);
    const inv = found.rows[0];
    if (!inv || inv.accepted_at || inv.expires_at < new Date()) {
      throw new BadRequestException('Invitation is invalid or expired');
    }

    const existing = await this.db.query<{ id: string; password_hash: string | null }>(
      'SELECT id, password_hash FROM users WHERE email = $1',
      [inv.email.toLowerCase()],
    );
    let userId: string;
    if (existing.rows[0]) {
      if (!(await verifyPassword(input.password, existing.rows[0].password_hash))) {
        throw new UnauthorizedException('Account exists: enter your current password');
      }
      userId = existing.rows[0].id;
    } else {
      userId = randomUUID();
      await this.db.query(
        'INSERT INTO users (id, email, password_hash, full_name) VALUES ($1, $2, $3, $4)',
        [userId, inv.email.toLowerCase(), await hashPassword(input.password), input.fullName],
      );
    }

    await this.db.withTenant(inv.tenant_id, async (c) => {
      await c.query(
        `INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, user_id) DO NOTHING`,
        [inv.tenant_id, userId, inv.role],
      );
      await c.query('UPDATE invitations SET accepted_at = now() WHERE id = $1', [inv.id]);
    });

    const tokens = await this.issueTokens(userId, inv.tenant_id, inv.role);
    return { ...tokens, tenantId: inv.tenant_id, role: inv.role };
  }
}
