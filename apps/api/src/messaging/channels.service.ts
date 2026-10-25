import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { PlansService } from '../plans/plans.service';
import { CryptoService } from './crypto.service';
import { connectionHealth, ConnectionHealth } from './connection-health';
import { GRAPH, ProviderError } from './adapters/adapter';
import { telegramCall } from './adapters/telegram.adapter';

export type ChannelType = 'web' | 'whatsapp' | 'facebook' | 'instagram' | 'telegram';

export interface ChannelRow {
  id: string;
  tenant_id: string;
  type: ChannelType;
  name: string;
  status: 'active' | 'disabled';
  credentials_enc: string | null;
  settings: Record<string, unknown>;
}

export const widgetSettingsSchema = z.object({
  title: z.string().max(60).default('تحدث معنا'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#2563eb'),
  welcomeMessage: z.string().max(500).default('أهلًا بك! كيف يمكننا مساعدتك؟'),
  direction: z.enum(['ltr', 'rtl']).default('rtl'),
  position: z.enum(['left', 'right']).default('right'),
  allowedOrigins: z.array(z.string().url()).max(20).default([]),
});

export const createChannelSchema = z.discriminatedUnion('type', [
  z.object({type:z.literal('telegram'),name:z.string().min(1).max(80),credentials:z.object({botToken:z.string().regex(/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/)})}),
  z.object({
    type: z.literal('web'),
    name: z.string().min(1).max(80),
    settings: widgetSettingsSchema.partial().optional(),
  }),
  z.object({
    type: z.literal('whatsapp'),
    name: z.string().min(1).max(80),
    credentials: z.object({
      accessToken: z.string().min(10),
      phoneNumberId: z.string().min(3),
      wabaId: z.string().regex(/^\d+$/).optional(),
    }),
  }),
  z.object({
    type: z.literal('facebook'),
    name: z.string().min(1).max(80),
    credentials: z.object({ pageAccessToken: z.string().min(10), pageId: z.string().min(3) }),
  }),
  z.object({
    type: z.literal('instagram'),
    name: z.string().min(1).max(80),
    credentials: z.object({ pageAccessToken: z.string().min(10), igAccountId: z.string().min(3) }),
  }),
]);
export type CreateChannelInput = z.infer<typeof createChannelSchema>;

export const updateChannelSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  settings: widgetSettingsSchema.partial().optional(),
});

const PUBLIC_COLS = 'id, type, name, external_id, settings, status, created_at';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly plans: PlansService,
    private readonly crypto: CryptoService,
  ) {}

  private view<T extends { type: string; external_id: string; status: string; settings?: Record<string, unknown> }>(row: T) {
    const health = connectionHealth(row);
    return row.type === 'web'
      ? {
          ...row,
          connectionHealth: health,
          widgetSnippet: `<script src="${env.PUBLIC_API_URL}/widget.js" data-key="${row.external_id}" async></script>`,
        }
      : { ...row, connectionHealth: health };
  }

  /** Read-only provider request. Never subscribes, disconnects or sends a message. */
  async verify(tenantId: string, id: string) {
    const row = await this.db.withTenant(tenantId, async (c) =>
      (await c.query('SELECT * FROM channels WHERE id=$1', [id])).rows[0]);
    if (!row) throw new NotFoundException('Channel not found');
    if (row.type === 'web' || row.status !== 'active') return connectionHealth(row);
    if (env.EXTERNAL_DELIVERY_ENABLED !== 'true')
      return { state: 'needs_action', checkedAt: null, reason: 'external_access_disabled' };
    const credentials = this.credentials(row);
    const token = credentials.accessToken || credentials.pageAccessToken;
    const checkedAt = new Date().toISOString();
    let health: ConnectionHealth;
    try {
      if (row.type === 'telegram') {
        const account=await telegramCall(credentials.botToken,'getMe');
        health={state:String(account.id)===row.external_id?'connected':'needs_action',checkedAt,reason:String(account.id)===row.external_id?'provider_verified':'provider_rejected'};
      } else {
      const response = await fetch(`${GRAPH}/${encodeURIComponent(row.external_id)}?fields=id`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
      });
      const result = await response.json() as { id?: string; error?: { code?: number } };
      health = response.ok && result.id === row.external_id
        ? { state: 'connected', checkedAt, reason: 'provider_verified' }
        : { state: result.error?.code === 190 ? 'expired' : 'needs_action', checkedAt, reason: result.error?.code === 190 ? 'authorization_expired' : 'provider_rejected' };
      }
    } catch(e) {
      health = e instanceof ProviderError && e.status === 401
        ? {state:'expired',checkedAt,reason:'authorization_expired'}
        : { state: 'needs_action', checkedAt, reason: e instanceof ProviderError && e.status < 500 ? 'provider_rejected' : 'provider_unreachable' };
    }
    const saved = await this.db.withTenant(tenantId, (c) => c.query(
      `UPDATE channels SET settings=jsonb_set(settings,'{connectionHealth}',$2::jsonb) WHERE id=$1 AND status='active' AND credentials_enc IS NOT DISTINCT FROM $3`,
      [id, JSON.stringify(health), row.credentials_enc],
    ));
    if (!saved.rowCount) return {state:'needs_action',checkedAt:null,reason:'verification_required'};
    return health;
  }

  /** من الـ webhook أو الويدجت: بدون سياق شركة */
  async lookup(type: ChannelType, externalId: string): Promise<ChannelRow | null> {
    const r = await this.db.query<ChannelRow>('SELECT * FROM channel_lookup($1, $2)', [
      type,
      externalId,
    ]);
    return r.rows[0] ?? null;
  }

  credentials(channel: ChannelRow): Record<string, string> {
    return channel.credentials_enc
      ? this.crypto.decrypt<Record<string, string>>(channel.credentials_enc)
      : {};
  }

  list(tenantId: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const r = await c.query(`SELECT ${PUBLIC_COLS} FROM channels ORDER BY created_at`);
      return r.rows.map((x) => this.view(x));
    });
  }

  async create(tenantId: string, input: CreateChannelInput) {
    let externalId: string;
    let credentialsEnc: string | null = null;
    let settings: Record<string, unknown> = {};

    switch (input.type) {
      case 'telegram':
        externalId=input.credentials.botToken.split(':')[0];
        credentialsEnc=this.crypto.encrypt({...input.credentials,webhookSecret:randomBytes(32).toString('hex')});
        break;
      case 'web':
        externalId = randomBytes(12).toString('hex');
        settings = widgetSettingsSchema.parse(input.settings ?? {});
        break;
      case 'whatsapp':
        externalId = input.credentials.phoneNumberId;
        credentialsEnc = this.crypto.encrypt(input.credentials);
        break;
      case 'facebook':
        externalId = input.credentials.pageId;
        credentialsEnc = this.crypto.encrypt(input.credentials);
        break;
      case 'instagram':
        externalId = input.credentials.igAccountId;
        credentialsEnc = this.crypto.encrypt(input.credentials);
        break;
    }

    try {
      return await this.db.withTenant(tenantId, async (c) => {
        await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
        const count = (await c.query('SELECT count(*)::int AS n FROM channels')).rows[0].n;
        await this.plans.assertWithinLimit(c, 'channels', count);
        const r = await c.query(
          `INSERT INTO channels (tenant_id, type, name, external_id, credentials_enc, settings)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${PUBLIC_COLS}`,
          [tenantId, input.type, input.name, externalId, credentialsEnc, JSON.stringify(settings)],
        );
        return this.view(r.rows[0]);
      });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw new ConflictException('This account is already connected');
      }
      throw e;
    }
  }

  update(tenantId: string, id: string, input: z.infer<typeof updateChannelSchema>) {
    return this.db.withTenant(tenantId, async (c) => {
      const cur = (await c.query('SELECT settings FROM channels WHERE id = $1', [id])).rows[0];
      if (!cur) throw new NotFoundException('Channel not found');
      const settings = input.settings ? { ...cur.settings, ...input.settings } : cur.settings;
      const r = await c.query(
        `UPDATE channels SET name = COALESCE($2, name), status = COALESCE($3, status), settings = $4
         WHERE id = $1 RETURNING ${PUBLIC_COLS}`,
        [id, input.name ?? null, input.status ?? null, JSON.stringify(settings)],
      );
      return this.view(r.rows[0]);
    });
  }

  reconnect(tenantId: string, id: string, accessToken: string, wabaId?: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const row = (
        await c.query('SELECT type,external_id,credentials_enc FROM channels WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      if (!row) throw new NotFoundException('Channel not found');
      if (row.type === 'web')
        throw new BadRequestException('Website channels do not use provider tokens');
      const credentials = this.credentials(row as ChannelRow);
      if(row.type==='telegram'&&(!/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(accessToken)||accessToken.split(':')[0]!==row.external_id))throw new BadRequestException('Token must belong to the same Telegram bot');
      credentials[row.type === 'telegram'?'botToken':row.type === 'whatsapp' ? 'accessToken' : 'pageAccessToken'] = accessToken;
      if (row.type === 'whatsapp' && wabaId) credentials.wabaId = wabaId;
      await c.query("UPDATE channels SET credentials_enc=$2,status='active',settings=settings-'connectionHealth' WHERE id=$1", [
        id,
        this.crypto.encrypt(credentials),
      ]);
      return { saved: true, verified: false };
    });
  }

  retryWebhook(tenantId: string, id: string, jobId: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const r = await c.query(
        "UPDATE webhook_jobs SET status='pending',attempts=0,error=NULL,available_at=now(),lease_until=NULL,updated_at=now() WHERE id=$1 AND channel_id=$2 AND status='failed' RETURNING id",
        [jobId, id],
      );
      if (!r.rowCount) throw new NotFoundException('Failed job not found');
      return { queued: true };
    });
  }

  async setupTelegram(tenantId:string,id:string) {
    if(env.EXTERNAL_DELIVERY_ENABLED!=='true')throw new BadRequestException('External access is disabled');
    if(!env.PUBLIC_API_URL.startsWith('https://'))throw new BadRequestException('Telegram requires a public HTTPS webhook URL');
    const row=await this.db.withTenant(tenantId,async c=>(await c.query("SELECT * FROM channels WHERE id=$1 AND type='telegram' AND status='active'",[id])).rows[0]);
    if(!row)throw new NotFoundException('Active Telegram channel not found');
    const credentials=this.credentials(row);
    const account=await telegramCall(credentials.botToken,'getMe');
    if(String(account.id)!==row.external_id)throw new BadRequestException('Telegram bot identity mismatch');
    await telegramCall(credentials.botToken,'setWebhook',{url:`${env.PUBLIC_API_URL.replace(/\/$/,'')}/webhooks/telegram/${row.external_id}`,secret_token:credentials.webhookSecret,allowed_updates:['message','callback_query'],drop_pending_updates:false});
    return{configured:true,verifiedBot:true,liveInboundTested:false};
  }

  remove(tenantId: string, id: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const r = await c.query('DELETE FROM channels WHERE id = $1', [id]);
      if (!r.rowCount) throw new NotFoundException('Channel not found');
      return { removed: true };
    });
  }
}
