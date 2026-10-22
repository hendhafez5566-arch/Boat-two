/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Response } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { DatabaseService } from '../database/database.service';
import { GRAPH } from '../messaging/adapters/adapter';
import { ChannelRow, ChannelsService } from '../messaging/channels.service';
import { contentSchema } from '../messaging/message-content';
import { MessagingService } from '../messaging/messaging.service';
import { AssignmentService } from './assignment.service';
import { escapeLike } from './assignment';

const listQuery = z.object({
  status: z.enum(['active', 'open', 'pending', 'closed']).optional(),
  channelId: z.string().uuid().optional(),
  assignee: z.union([z.enum(['me', 'unassigned']), z.string().uuid()]).optional(),
  handledBy: z.enum(['bot', 'human']).optional(),
  unread: z.enum(['true', 'false']).optional(),
  q: z.string().max(100).optional(),
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
const messagesQuery = z.object({
  afterSeq: z.coerce.number().int().min(0).optional(),
  beforeSeq: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const patchSchema = z.object({
  status: z.enum(['open', 'pending', 'closed']).optional(),
  handledBy: z.enum(['bot', 'human']).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
});
const noteSchema = z.object({ text: z.string().min(1).max(2000) });
const availabilitySchema = z.object({ available: z.boolean() });
const settingsSchema = z.object({
  auto_assign: z.boolean().optional(),
  max_open_per_agent: z.number().int().min(1).max(500).optional(),
});

const MEDIA_TYPES =
  /^(image\/(jpeg|png|webp|gif)|video\/mp4|audio\/(ogg|mpeg|mp4|aac|amr)|application\/pdf)$/;

@Controller()
export class InboxController {
  constructor(
    private readonly db: DatabaseService,
    private readonly messaging: MessagingService,
    private readonly assignment: AssignmentService,
    private readonly channels: ChannelsService,
    private readonly events: EventEmitter2,
  ) {}

  private changed(tenantId: string, conversationId: string, reason: string) {
    this.events.emit('conversation.updated', { tenantId, conversationId, reason });
  }

  /** سجل نشاط داخلي يظهر في الخيط للموظفين فقط */
  private async logEvent(c: PoolClient, conversationId: string, content: Record<string, unknown>) {
    await c.query(
      `INSERT INTO messages (tenant_id, conversation_id, channel_id, direction, sender_type, type, content, status, is_internal)
       SELECT tenant_id, id, channel_id, 'out', 'system', 'event', $2::jsonb, 'sent', true FROM conversations WHERE id = $1`,
      [conversationId, JSON.stringify(content)],
    );
  }

  private expireSessions(c: PoolClient, conversationId: string) {
    return c.query(
      "UPDATE flow_sessions SET status = 'expired', updated_at = now() WHERE conversation_id = $1 AND status = 'waiting'",
      [conversationId],
    );
  }

  // ---------------------------------------------------------------- list / counts / detail

  @Get('conversations')
  list(@Req() req: AuthedRequest, @Query() query: unknown) {
    const q = parse(listQuery, query);
    const assigneeMode = !q.assignee ? null : q.assignee === 'unassigned' ? 'unassigned' : 'user';
    const assigneeId =
      q.assignee === 'me'
        ? req.user.userId
        : q.assignee && q.assignee !== 'unassigned'
          ? q.assignee
          : null;
    const pattern = q.q?.trim() ? `%${escapeLike(q.q.trim())}%` : null;

    return this.db.withTenant(req.user.tenantId, async (c) => {
      const r = await c.query(
        `SELECT cv.id, cv.status, cv.handled_by, cv.assigned_to, au.full_name AS assignee_name, cv.last_message_at,
                cv.unread_count, cv.last_inbound_at, ch.id AS channel_id, ch.type AS channel_type, ch.name AS channel_name,
                ct.id AS contact_id, ct.name AS contact_name, ct.phone AS contact_phone,
                (SELECT m.content FROM messages m WHERE m.conversation_id = cv.id AND m.is_internal = false ORDER BY m.seq DESC LIMIT 1) AS last_message
         FROM conversations cv
         JOIN channels ch ON ch.id = cv.channel_id
         JOIN contacts ct ON ct.id = cv.contact_id
         LEFT JOIN users au ON au.id = cv.assigned_to
         WHERE ($1::text IS NULL OR ($1 = 'active' AND cv.status <> 'closed') OR cv.status = $1)
           AND ($2::uuid IS NULL OR cv.channel_id = $2)
           AND ($3::timestamptz IS NULL OR cv.last_message_at < $3)
           AND ($5::text IS NULL OR ($5 = 'unassigned' AND cv.assigned_to IS NULL) OR ($5 = 'user' AND cv.assigned_to = $6::uuid))
           AND ($7::text IS NULL OR cv.handled_by = $7)
           AND (NOT $8::boolean OR cv.unread_count > 0)
           AND ($9::text IS NULL OR ct.name ILIKE $9 OR ct.phone ILIKE $9 OR EXISTS (
                 SELECT 1 FROM messages m WHERE m.conversation_id = cv.id AND m.is_internal = false AND m.content->>'text' ILIKE $9))
         ORDER BY cv.last_message_at DESC LIMIT $4`,
        [
          q.status ?? null,
          q.channelId ?? null,
          q.before ?? null,
          q.limit,
          assigneeMode,
          assigneeId,
          q.handledBy ?? null,
          q.unread === 'true',
          pattern,
        ],
      );
      return {
        items: r.rows,
        nextBefore: r.rows.length === q.limit ? r.rows[r.rows.length - 1].last_message_at : null,
      };
    });
  }

  @Roles('owner', 'admin')
  @Post('conversations/bulk')
  async bulk(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = parse(
      z.object({ ids: z.array(z.string().uuid()).min(1).max(100), patch: patchSchema }),
      body,
    );
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of [...new Set(input.ids)]) {
      try {
        await this.update(req, id, input.patch);
        results.push({ id, ok: true });
      } catch (e) {
        results.push({ id, ok: false, error: (e as Error).message });
      }
    }
    return { results };
  }

  @Get('conversations/counts')
  counts(@Req() req: AuthedRequest) {
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const r = await c.query(
        `SELECT count(*) FILTER (WHERE status <> 'closed')::int AS active,
                count(*) FILTER (WHERE status <> 'closed' AND assigned_to = $1)::int AS mine,
                count(*) FILTER (WHERE status <> 'closed' AND assigned_to IS NULL)::int AS unassigned,
                count(*) FILTER (WHERE status <> 'closed' AND unread_count > 0)::int AS unread,
                count(*) FILTER (WHERE status <> 'closed' AND handled_by = 'bot')::int AS bot,
                count(*) FILTER (WHERE status = 'closed')::int AS closed
         FROM conversations`,
        [req.user.userId],
      );
      return r.rows[0];
    });
  }

  @Get('conversations/:id')
  detail(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const r = (
        await c.query(
          `SELECT cv.id, cv.status, cv.handled_by, cv.assigned_to, au.full_name AS assignee_name, cv.unread_count,
                  cv.last_inbound_at, cv.created_at,
                  ch.id AS channel_id, ch.type AS channel_type, ch.name AS channel_name,
                  ct.id AS contact_id, ct.name AS contact_name, ct.phone AS contact_phone, ct.email AS contact_email,
                  ct.attributes AS contact_attributes, ct.created_at AS contact_since,
                  (SELECT fs.wait_kind FROM flow_sessions fs WHERE fs.conversation_id = cv.id AND fs.status = 'waiting' LIMIT 1) AS flow_waiting
           FROM conversations cv
           JOIN channels ch ON ch.id = cv.channel_id
           JOIN contacts ct ON ct.id = cv.contact_id
           LEFT JOIN users au ON au.id = cv.assigned_to
           WHERE cv.id = $1`,
          [id],
        )
      ).rows[0];
      if (!r) throw new NotFoundException('Conversation not found');
      // نافذة الـ 24 ساعة في واتساب
      const windowExpiresAt =
        r.channel_type === 'whatsapp' && r.last_inbound_at
          ? new Date(new Date(r.last_inbound_at).getTime() + 24 * 3600 * 1000).toISOString()
          : null;
      return { ...r, whatsapp_window_expires_at: windowExpiresAt };
    });
  }

  // ---------------------------------------------------------------- messages

  @Get('conversations/:id/messages')
  messages(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown,
  ) {
    const q = parse(messagesQuery, query);
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const exists = await c.query('SELECT 1 FROM conversations WHERE id = $1', [id]);
      if (!exists.rowCount) throw new NotFoundException('Conversation not found');
      const cols = `m.id, m.seq, m.direction, m.sender_type, m.sender_user_id, u.full_name AS sender_name, m.type,
                    m.content, m.status, m.error, m.is_internal, m.created_at`;
      if (q.afterSeq !== undefined) {
        const r = await c.query(
          `SELECT ${cols} FROM messages m LEFT JOIN users u ON u.id = m.sender_user_id
           WHERE m.conversation_id = $1 AND m.seq > $2 ORDER BY m.seq LIMIT $3`,
          [id, q.afterSeq, q.limit],
        );
        return { items: r.rows, hasMore: false };
      }
      const r = await c.query(
        `SELECT ${cols} FROM messages m LEFT JOIN users u ON u.id = m.sender_user_id
         WHERE m.conversation_id = $1 AND ($2::bigint IS NULL OR m.seq < $2) ORDER BY m.seq DESC LIMIT $3`,
        [id, q.beforeSeq ?? null, q.limit + 1],
      );
      const rows = r.rows.slice(0, q.limit).reverse();
      return { items: rows, hasMore: r.rows.length > q.limit };
    });
  }

  @Post('conversations/:id/messages')
  async send(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const content = parse(contentSchema, body);
    const result = await this.messaging.sendOutbound({
      tenantId: req.user.tenantId,
      conversationId: id,
      content,
      senderType: 'agent',
      senderUserId: req.user.userId,
    });
    await this.db.withTenant(req.user.tenantId, async (c) => {
      const before = (
        await c.query('SELECT handled_by, status FROM conversations WHERE id = $1', [id])
      ).rows[0];
      await c.query(
        `UPDATE conversations SET handled_by = 'human', assigned_to = COALESCE(assigned_to, $2), status = 'open', unread_count = 0 WHERE id = $1`,
        [id, req.user.userId],
      );
      if (before?.handled_by === 'bot') {
        await this.expireSessions(c, id);
        await this.logEvent(c, id, { event: 'taken_over', by: req.user.userId });
      }
    });
    this.changed(req.user.tenantId, id, 'agent_reply');
    return result;
  }

  @Post('conversations/:id/notes')
  async note(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const { text } = parse(noteSchema, body);
    const msg = await this.db.withTenant(req.user.tenantId, async (c) => {
      const r = await c.query(
        `INSERT INTO messages (tenant_id, conversation_id, channel_id, direction, sender_type, sender_user_id, type, content, status, is_internal)
         SELECT tenant_id, id, channel_id, 'out', 'agent', $2, 'note', $3::jsonb, 'sent', true FROM conversations WHERE id = $1
         RETURNING id, seq, created_at`,
        [id, req.user.userId, JSON.stringify({ text })],
      );
      if (!r.rows[0]) throw new NotFoundException('Conversation not found');
      return r.rows[0];
    });
    this.events.emit('message.created', {
      tenantId: req.user.tenantId,
      conversationId: id,
      message: {
        id: msg.id,
        seq: Number(msg.seq),
        direction: 'out',
        senderType: 'agent',
        senderUserId: req.user.userId,
        type: 'note',
        content: { text },
        status: 'sent',
        isInternal: true,
        createdAt: msg.created_at,
      },
    });
    return { id: msg.id, seq: Number(msg.seq) };
  }

  @Post('conversations/:id/read')
  async read(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.withTenant(req.user.tenantId, (c) =>
      c.query('UPDATE conversations SET unread_count = 0 WHERE id = $1', [id]),
    );
    this.changed(req.user.tenantId, id, 'read');
    return { ok: true };
  }

  // ---------------------------------------------------------------- state changes

  @Patch('conversations/:id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const p = parse(patchSchema, body);
    const out = await this.db.withTenant(req.user.tenantId, async (c) => {
      const cur = (
        await c.query('SELECT status, handled_by, assigned_to FROM conversations WHERE id = $1', [
          id,
        ])
      ).rows[0];
      if (!cur) throw new NotFoundException('Conversation not found');
      if (p.assignedTo) {
        const m = await c.query('SELECT 1 FROM memberships WHERE user_id = $1', [p.assignedTo]);
        if (!m.rowCount)
          throw new BadRequestException('Assignee is not a member of this workspace');
      }
      const r = await c.query(
        `UPDATE conversations SET status = COALESCE($2, status), handled_by = COALESCE($3, handled_by),
           assigned_to = CASE WHEN $4::boolean THEN $5::uuid ELSE assigned_to END
         WHERE id = $1 RETURNING id, status, handled_by, assigned_to`,
        [
          id,
          p.status ?? null,
          p.handledBy ?? null,
          p.assignedTo !== undefined,
          p.assignedTo ?? null,
        ],
      );
      const by = req.user.userId;
      if (p.status && p.status !== cur.status)
        await this.logEvent(c, id, { event: 'status', status: p.status, by });
      if (p.assignedTo !== undefined && p.assignedTo !== cur.assigned_to) {
        await this.logEvent(
          c,
          id,
          p.assignedTo
            ? { event: 'assigned', userId: p.assignedTo, by }
            : { event: 'unassigned', by },
        );
      }
      if (p.handledBy && p.handledBy !== cur.handled_by) {
        await this.expireSessions(c, id);
        await this.logEvent(c, id, {
          event: p.handledBy === 'human' ? 'taken_over' : 'returned_to_bot',
          by,
        });
      }
      return r.rows[0];
    });
    this.changed(req.user.tenantId, id, 'updated');
    return out;
  }

  @Post('conversations/:id/takeover')
  async takeover(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    const out = await this.db.withTenant(req.user.tenantId, async (c) => {
      const r = await c.query(
        "UPDATE conversations SET handled_by = 'human', assigned_to = $2, status = 'open' WHERE id = $1 RETURNING id, status, handled_by, assigned_to",
        [id, req.user.userId],
      );
      if (!r.rows[0]) throw new NotFoundException('Conversation not found');
      await this.expireSessions(c, id);
      await this.logEvent(c, id, { event: 'taken_over', by: req.user.userId });
      return r.rows[0];
    });
    this.changed(req.user.tenantId, id, 'takeover');
    return out;
  }

  @Post('conversations/:id/release')
  async release(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    const out = await this.db.withTenant(req.user.tenantId, async (c) => {
      const r = await c.query(
        "UPDATE conversations SET handled_by = 'bot', assigned_to = NULL, status = 'open' WHERE id = $1 RETURNING id, status, handled_by, assigned_to",
        [id],
      );
      if (!r.rows[0]) throw new NotFoundException('Conversation not found');
      await this.expireSessions(c, id);
      await this.logEvent(c, id, { event: 'returned_to_bot', by: req.user.userId });
      return r.rows[0];
    });
    this.changed(req.user.tenantId, id, 'release');
    return out;
  }

  @Post('conversations/:id/auto-assign')
  async autoAssign(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    const agent = await this.assignment.autoAssignIfEnabled(req.user.tenantId, id, true);
    if (!agent)
      throw new BadRequestException('No available agent (everyone is away or at capacity)');
    return { assignedTo: agent };
  }

  // ---------------------------------------------------------------- inbound media (WhatsApp keeps media on Meta servers)

  @Get('conversations/:id/messages/:messageId/media')
  async media(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Res() res: Response,
  ) {
    const row = await this.db.withTenant(req.user.tenantId, async (c) => {
      const r = await c.query(
        `SELECT m.content, ch.type, ch.credentials_enc FROM messages m JOIN channels ch ON ch.id = m.channel_id
         WHERE m.id = $1 AND m.conversation_id = $2`,
        [messageId, id],
      );
      return r.rows[0];
    });
    const media = row?.content?.media;
    if (!media?.providerMediaId || row.type !== 'whatsapp')
      throw new NotFoundException('No downloadable media');

    const creds = this.channels.credentials({ credentials_enc: row.credentials_enc } as ChannelRow);
    const auth = { Authorization: `Bearer ${creds.accessToken}` };
    const meta: any = await fetch(`${GRAPH}/${encodeURIComponent(media.providerMediaId)}`, {
      headers: auth,
      signal: AbortSignal.timeout(15000),
    })
      .then((r) => r.json())
      .catch(() => null);
    if (!meta?.url || !/^https:\/\//.test(meta.url))
      throw new NotFoundException('Media is no longer available');
    const file = await fetch(meta.url, { headers: auth, signal: AbortSignal.timeout(30000) });
    if (!file.ok) throw new NotFoundException('Media is no longer available');
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > 16 * 1024 * 1024) throw new BadRequestException('Media is too large');

    const mime = MEDIA_TYPES.test(String(meta.mime_type ?? ''))
      ? String(meta.mime_type)
      : 'application/octet-stream';
    res.set({
      'Content-Type': mime,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, max-age=300',
      ...(mime === 'application/octet-stream' ? { 'Content-Disposition': 'attachment' } : {}),
    });
    res.send(buf);
  }

  // ---------------------------------------------------------------- availability & settings

  @Patch('team/me/availability')
  async availability(@Req() req: AuthedRequest, @Body() body: unknown) {
    const { available } = parse(availabilitySchema, body);
    await this.db.withTenant(req.user.tenantId, (c) =>
      c.query('UPDATE memberships SET available = $2 WHERE user_id = $1', [
        req.user.userId,
        available,
      ]),
    );
    return { available };
  }

  @Get('inbox/settings')
  settings(@Req() req: AuthedRequest) {
    return this.assignment.getSettings(req.user.tenantId);
  }

  @Roles('owner', 'admin')
  @Put('inbox/settings')
  saveSettings(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.assignment.saveSettings(req.user.tenantId, parse(settingsSchema, body));
  }
}
