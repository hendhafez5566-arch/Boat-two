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
      redirectUri: `${env.PUBLIC_API_URL}/channels/meta/callback`,
    };
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
    const { kind } = parse(z.object({ kind: z.enum(['facebook', 'instagram', 'whatsapp']) }), body);
    if (kind === 'whatsapp' && !env.META_EMBEDDED_CONFIG_ID)
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
    return { state, authorizeUrl: `https://www.facebook.com/v21.0/dialog/oauth?${params}` };
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
      throw new BadRequestException('Meta login configuration must issue a System User access token');
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
