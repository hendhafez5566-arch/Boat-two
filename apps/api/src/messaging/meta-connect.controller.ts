import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Public, Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { DatabaseService } from '../database/database.service';
import { env } from '../config/env';
import { CryptoService } from './crypto.service';
import { ChannelsService } from './channels.service';
import { GRAPH } from './adapters/adapter';
import { inspectMetaMessagingPermission } from './meta-messaging-inspection';
type Asset = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
};
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
@Controller('channels/meta')
export class MetaConnectController {
  constructor(
    private db: DatabaseService,
    private crypto: CryptoService,
    private channels: ChannelsService,
  ) {}
  @Get('config') config() {
    return {
      configured: !!env.META_APP_ID && !!env.META_APP_SECRET,
      externalEnabled: env.EXTERNAL_DELIVERY_ENABLED === 'true',
      connectEnabled:
        env.META_CONNECT_ENABLED === 'true' || env.EXTERNAL_DELIVERY_ENABLED === 'true',
      appId: env.META_APP_ID || null,
      embeddedConfigId: env.META_EMBEDDED_CONFIG_ID || null,
      catalogConfigured: !!env.META_EMBEDDED_CATALOG_CONFIG_ID,
      webhookUrl: `${env.PUBLIC_API_URL.replace(/\/$/, '')}/webhooks/whatsapp`,
      redirectUri: `${env.PUBLIC_API_URL}/channels/meta/callback`,
    };
  }
  @Roles('owner', 'admin')
  @Get('whatsapp/accounts')
  async whatsappAccounts(@Req() r: AuthedRequest) {
    const publicRows = (await this.channels.list(r.user.tenantId)).filter(
      (c) => c.type === 'whatsapp',
    );
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const rows = (await c.query("SELECT id,credentials_enc FROM channels WHERE type='whatsapp'"))
        .rows;
      const businesses = new Map(
        rows.map((row) => [
          row.id,
          row.credentials_enc
            ? this.crypto.decrypt<{ wabaId?: string }>(row.credentials_enc).wabaId || null
            : null,
        ]),
      );
      return publicRows.map((row) => ({
        ...row,
        businessAccountId: businesses.get(row.id) || null,
      }));
    });
  }
  private ready() {
    if (
      (env.META_CONNECT_ENABLED !== 'true' && env.EXTERNAL_DELIVERY_ENABLED !== 'true') ||
      !env.META_APP_ID ||
      !env.META_APP_SECRET
    )
      throw new ServiceUnavailableException(
        'Operator must configure Meta app, approved permissions, redirect URI and explicitly enable Meta connection setup',
      );
  }
  @Roles('owner', 'admin')
  @Post('start')
  async start(@Req() r: AuthedRequest, @Body() body: unknown) {
    this.ready();
    const { kind, withCatalog } = parse(
      z.object({
        kind: z.enum(['facebook', 'instagram', 'whatsapp']),
        withCatalog: z.boolean().default(false),
      }),
      body,
    );
    const embeddedConfigId = withCatalog
      ? env.META_EMBEDDED_CATALOG_CONFIG_ID
      : env.META_EMBEDDED_CONFIG_ID;
    if (kind === 'whatsapp' && !embeddedConfigId)
      throw new ServiceUnavailableException('WhatsApp Embedded Signup configuration ID required');
    const state = randomBytes(32).toString('hex');
    await this.db.withTenant(r.user.tenantId, (c) =>
      c.query(
        'INSERT INTO meta_connections(tenant_id,user_id,state_hash,kind) VALUES($1,$2,$3,$4)',
        [r.user.tenantId, r.user.userId, digest(state), kind],
      ),
    );
    const params = new URLSearchParams({
      client_id: env.META_APP_ID!,
      redirect_uri: `${env.PUBLIC_API_URL}/channels/meta/callback`,
      state,
      response_type: 'code',
      scope:
        kind === 'instagram'
          ? 'pages_show_list,pages_manage_metadata,instagram_basic,instagram_manage_messages'
          : 'pages_show_list,pages_manage_metadata,pages_messaging',
    });
    return {
      state,
      authorizeUrl: `https://www.facebook.com/v21.0/dialog/oauth?${params}`,
      ...(kind === 'whatsapp' ? { embeddedConfigId } : {}),
    };
  }
  private async exchange(
    state: string,
    code: string,
    embedded = false,
    owner?: AuthedRequest['user'],
  ) {
    this.ready();
    const lookup = (
      await this.db.query<{ id: string; tenant_id: string }>(
        'SELECT * FROM meta_connection_lookup($1)',
        [digest(state)],
      )
    ).rows[0];
    if (!lookup) throw new BadRequestException('Connection state expired or already consumed');
    if (owner && lookup.tenant_id !== owner.tenantId)
      throw new BadRequestException('Connection owner mismatch');
    const row = await this.db.withTenant(lookup.tenant_id, async (c) => {
      const s = (
        await c.query('SELECT * FROM meta_connections WHERE id=$1 FOR UPDATE', [lookup.id])
      ).rows[0];
      if (!s || (owner && (s.tenant_id !== owner.tenantId || s.user_id !== owner.userId)))
        throw new BadRequestException('Connection owner mismatch');
      if (s.consumed || new Date(s.expires_at) <= new Date())
        throw new BadRequestException('State already consumed');
      if (embedded !== (s.kind === 'whatsapp'))
        throw new BadRequestException('Wrong connection flow');
      if (
        !(
          await c.query(
            "SELECT 1 FROM memberships WHERE user_id=$1 AND role IN ('owner','admin')",
            [s.user_id],
          )
        ).rowCount
      )
        throw new BadRequestException('Membership no longer authorized');
      await c.query('UPDATE meta_connections SET consumed=true WHERE id=$1', [s.id]);
      return s;
    });
    const params = new URLSearchParams({
      client_id: env.META_APP_ID!,
      client_secret: env.META_APP_SECRET!,
      code,
      ...(!embedded ? { redirect_uri: `${env.PUBLIC_API_URL}/channels/meta/callback` } : {}),
    });
    const response = await fetch(`${GRAPH}/oauth/access_token?${params}`, {
      signal: AbortSignal.timeout(30000),
    });
    const token = (await response.json()) as { access_token?: string };
    if (!response.ok || !token.access_token)
      throw new BadRequestException('Meta code exchange failed; start a new connection');
    return { row, token: token.access_token };
  }
  @Public() @Get('callback') async callback(
    @Query('state') state: string,
    @Query('code') code: string,
    @Res() res: Response,
  ) {
    try {
      const input = parse(
        z.object({ state: z.string().length(64), code: z.string().min(1).max(4000) }),
        { state, code },
      );
      const { row, token } = await this.exchange(input.state, input.code);
      let url: string | undefined =
        `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100`;
      const assets: Asset[] = [];
      for (let page = 0; page < 10 && url; page++) {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(30000),
        });
        const data = (await response.json()) as {
          data?: Asset[];
          paging?: { cursors?: { after?: string } };
        };
        if (!response.ok) throw new Error('Asset discovery failed');
        assets.push(...(data.data || []));
        url =
          data.data?.length === 100 && data.paging?.cursors?.after
            ? `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100&after=${encodeURIComponent(data.paging.cursors.after)}`
            : undefined;
      }
      await this.db.withTenant(row.tenant_id, (c) =>
        c.query('UPDATE meta_connections SET assets_enc=$2 WHERE id=$1', [
          row.id,
          this.crypto.encrypt(assets),
        ]),
      );
      res.redirect(`${env.APP_URL}/dashboard/channels?meta=ready`);
    } catch {
      res.redirect(`${env.APP_URL}/dashboard/channels?meta=failed`);
    }
  }
  @Roles('owner', 'admin') @Get('connections') list(@Req() r: AuthedRequest) {
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const rows = (
        await c.query(
          'SELECT id,kind,assets_enc FROM meta_connections WHERE consumed AND assets_enc IS NOT NULL AND expires_at>now() AND user_id=$1',
          [r.user.userId],
        )
      ).rows;
      return rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        assets: this.crypto
          .decrypt<Asset[]>(row.assets_enc)
          .map((a) => ({ id: a.id, name: a.name, instagram: a.instagram_business_account })),
      }));
    });
  }
  @Roles('owner', 'admin') @Post('connections/:id/attach') async attach(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ pageId: z.string().min(1) }), body);
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const row = (
        await c.query(
          'SELECT * FROM meta_connections WHERE id=$1 AND user_id=$2 AND expires_at>now()',
          [id, r.user.userId],
        )
      ).rows[0];
      if (!row?.assets_enc) throw new BadRequestException('Connection expired');
      const asset = this.crypto.decrypt<Asset[]>(row.assets_enc).find((a) => a.id === b.pageId);
      if (!asset) throw new BadRequestException('Page not granted by Meta');
      if (row.kind === 'instagram') {
        if (!asset.instagram_business_account)
          throw new BadRequestException('No Instagram business account linked to page');
        return this.channels.create(r.user.tenantId, {
          type: 'instagram',
          name: asset.instagram_business_account.username || asset.name,
          credentials: {
            igAccountId: asset.instagram_business_account.id,
            pageAccessToken: asset.access_token,
          },
        });
      }
      return this.channels.create(r.user.tenantId, {
        type: 'facebook',
        name: asset.name,
        credentials: { pageId: asset.id, pageAccessToken: asset.access_token },
      });
    });
  }
  @Roles('owner', 'admin')
  @Post('manual/complete')
  async manual(@Req() r: AuthedRequest, @Body() body: unknown) {
    this.ready();
    const input = parse(
      z.object({
        wabaId: z.string().regex(/^\d+$/),
        accessToken: z.string().min(10).max(4000),
      }),
      body,
    );
    const auth = await inspectMetaMessagingPermission(input.accessToken);
    if (auth.status !== 'granted' || !auth.managementGranted)
      throw new BadRequestException(
        'Meta must grant WhatsApp messaging and management permissions',
      );
    const phones: { id: string; verified_name?: string }[] = [];
    let after: string | undefined;
    for (let page = 0; page < 10; page++) {
      const params = new URLSearchParams({
        fields: 'id,verified_name',
        limit: '100',
        ...(after ? { after } : {}),
      });
      const response = await fetch(`${GRAPH}/${input.wabaId}/phone_numbers?${params}`, {
        headers: { Authorization: `Bearer ${input.accessToken}` },
        signal: AbortSignal.timeout(15000),
      });
      const result = (await response.json()) as {
        data?: { id: string; verified_name?: string }[];
        paging?: { cursors?: { after?: string }; next?: string };
      };
      if (
        !response.ok ||
        !Array.isArray(result.data) ||
        result.data.some(
          (p) =>
            typeof p?.id !== 'string' ||
            !/^\d{1,30}$/.test(p.id) ||
            (p.verified_name !== undefined && typeof p.verified_name !== 'string'),
        )
      )
        throw new BadRequestException('Unable to verify WhatsApp Business Account phone numbers');
      phones.push(...result.data);
      if (!result.paging?.next) break;
      after = result.paging.cursors?.after;
      if (!after || page === 9)
        throw new BadRequestException(
          'Business account phone list is incomplete; contact the administrator',
        );
    }
    const unique = [...new Map(phones.map((p) => [p.id, p])).values()];
    if (!unique.length)
      throw new BadRequestException('No phone numbers found in this business account');
    const identities: {
      phone: (typeof unique)[number];
      existing: Awaited<ReturnType<ChannelsService['lookup']>>;
    }[] = [];
    for (const phone of unique) {
      const existing = await this.channels.lookup('whatsapp', phone.id);
      if (existing && existing.tenant_id !== r.user.tenantId)
        throw new ConflictException('This account is already connected');
      identities.push({ phone, existing });
    }
    // One transaction for all local writes; uniqueness guards a concurrent attach.
    const ids = await this.db.withTenant(r.user.tenantId, async () => {
      const saved: string[] = [];
      for (const { phone, existing } of identities) {
        if (existing) {
          await this.channels.reconnect(
            r.user.tenantId,
            existing.id,
            input.accessToken,
            input.wabaId,
          );
          saved.push(existing.id);
        } else {
          const created = await this.channels.create(r.user.tenantId, {
            type: 'whatsapp',
            name: (phone.verified_name || 'WhatsApp Business').slice(0, 80),
            credentials: {
              phoneNumberId: phone.id,
              wabaId: input.wabaId,
              accessToken: input.accessToken,
            },
          });
          saved.push(created.id);
        }
      }
      return saved;
    });
    const accounts = [];
    for (const id of ids) {
      const webhookReady = await this.channels.completeWhatsAppSubscription(r.user.tenantId, id);
      const health = await this.channels.verify(r.user.tenantId, id);
      accounts.push({ id, webhookReady: webhookReady && health.state === 'connected' });
    }
    return { accounts };
  }

  @Roles('owner', 'admin') @Post('embedded/complete') async embedded(
    @Req() r: AuthedRequest,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({
        state: z.string().length(64),
        code: z.string().min(1).max(4000),
        wabaId: z.string().regex(/^\d+$/),
        phoneNumberId: z.string().regex(/^\d+$/),
        name: z.string().min(1).max(80),
      }),
      body,
    );
    const { row, token } = await this.exchange(b.state, b.code, true, r.user);
    if (row.tenant_id !== r.user.tenantId || row.user_id !== r.user.userId)
      throw new BadRequestException('Connection owner mismatch');
    const auth = await inspectMetaMessagingPermission(token);
    if (auth.tokenType !== 'SYSTEM_USER')
      throw new BadRequestException(
        'Meta login configuration must issue a System User access token',
      );
    if (auth.status !== 'granted' || !auth.managementGranted)
      throw new BadRequestException(
        'Meta must grant WhatsApp messaging and management permissions',
      );
    const response = await fetch(`${GRAPH}/${b.wabaId}/phone_numbers?fields=id&limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000),
    });
    const data = (await response.json()) as { data?: { id: string }[] };
    if (!response.ok || !data.data?.some((p) => p.id === b.phoneNumberId))
      throw new BadRequestException('Selected phone number does not belong to granted WABA');
    // Reauthorization preserves channel, sessions, contacts and published bindings.
    // A phone already attached to another tenant must never be transferred here.
    const existing = await this.channels.lookup('whatsapp', b.phoneNumberId);
    if (existing && existing.tenant_id !== r.user.tenantId)
      throw new ConflictException('This account is already connected');
    if (existing) {
      await this.channels.reconnect(r.user.tenantId, existing.id, token, b.wabaId);
      const webhookReady = await this.channels.completeWhatsAppSubscription(
        r.user.tenantId,
        existing.id,
      );
      return { id: existing.id, reauthorized: true, webhookReady };
    }
    const created = await this.channels.create(r.user.tenantId, {
      type: 'whatsapp',
      name: b.name,
      credentials: { phoneNumberId: b.phoneNumberId, wabaId: b.wabaId, accessToken: token },
    });
    await this.channels.inspectAuthorization(r.user.tenantId, created.id);
    const webhookReady = await this.channels.completeWhatsAppSubscription(
      r.user.tenantId,
      created.id,
    );
    return { ...created, webhookReady };
  }
}
