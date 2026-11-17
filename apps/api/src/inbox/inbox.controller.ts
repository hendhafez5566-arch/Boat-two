/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  ForbiddenException,
  Delete,
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
import { telegramFile } from '../messaging/adapters/telegram.adapter';
import { GRAPH } from '../messaging/adapters/adapter';
import { ChannelRow, ChannelsService } from '../messaging/channels.service';
import { contentSchema } from '../messaging/message-content';
import { MessagingService } from '../messaging/messaging.service';
import { AssignmentService } from './assignment.service';
import { escapeLike } from './assignment';

const listQuery = z.object({
  view: z.enum(['all', 'important', 'archived', 'blocked']).default('all'),
  status: z.enum(['active', 'open', 'pending', 'closed']).optional(),
  channelId: z.string().uuid().optional(),
  assignee: z.union([z.enum(['me', 'unassigned']), z.string().uuid()]).optional(),
  handledBy: z.enum(['bot', 'human']).optional(),
  unread: z.enum(['true', 'false']).optional(),
  needsReply: z.enum(['true', 'false']).optional(),
  q: z.string().max(100).optional(),
  tag: z.string().max(50).optional(),
  sequenceId: z.string().uuid().optional(),
  orderBy: z.enum(['communication', 'subscriber']).default('communication'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  before: z.string().datetime().optional(),
  cursor: z
    .string()
    .max(300)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
const messagesQuery = z.object({
  afterSeq: z.coerce.number().int().min(0).optional(),
  beforeSeq: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const patchSchema = z.object({
  important: z.boolean().optional(),
  archived: z.boolean().optional(),
  blocked: z.boolean().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  status: z.enum(['open', 'pending', 'closed']).optional(),
  handledBy: z.enum(['bot', 'human']).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
});
const noteSchema = z.object({ text: z.string().trim().min(1).max(2000) });
const availabilitySchema = z.object({ available: z.boolean() });
const settingsSchema = z.object({
  signature_enabled: z.boolean().optional(),
  signature_template: z.string().max(200).optional(),
  human_session_minutes: z.number().int().min(0).max(10080).optional(),
  delivery_error_tag: z.string().max(50).optional(),
  sla_escalation_enabled: z.boolean().optional(),
  escalation_user_id: z.string().uuid().nullable().optional(),
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
    let cursor: { at: string; id: string } | undefined;
    if (q.cursor) {
      try {
        cursor = z
          .object({ at: z.string().datetime(), id: z.string().uuid() })
          .strict()
          .parse(JSON.parse(Buffer.from(q.cursor, 'base64url').toString('utf8')));
      } catch {
        throw new BadRequestException('Invalid conversation cursor');
      }
    }
    if (q.from && q.to && q.from > q.to) throw new BadRequestException('Invalid date range');
    const sortTime =
      q.orderBy === 'subscriber'
        ? 'COALESCE(cv.last_inbound_at,cv.last_message_at)'
        : 'cv.last_message_at';
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
        `SELECT cv.id,cv.important,cv.archived_at,EXISTS(SELECT 1 FROM contact_channels bc WHERE bc.contact_id=cv.contact_id AND bc.channel_id=cv.channel_id AND bc.blocked_at IS NOT NULL) AS blocked, cv.status, cv.handled_by, cv.assigned_to, au.full_name AS assignee_name, cv.last_message_at,
                to_char(${sortTime} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,
                cv.unread_count, cv.last_inbound_at, ch.id AS channel_id, ch.type AS channel_type, ch.name AS channel_name,
                ct.id AS contact_id, ct.name AS contact_name, ct.phone AS contact_phone,
                (SELECT m.content FROM messages m WHERE m.conversation_id = cv.id AND m.is_internal = false ORDER BY m.seq DESC LIMIT 1) AS last_message
         FROM conversations cv
         JOIN channels ch ON ch.id = cv.channel_id
         JOIN contacts ct ON ct.id = cv.contact_id
         LEFT JOIN users au ON au.id = cv.assigned_to
         WHERE ($1::text IS NULL OR ($1 = 'active' AND cv.status <> 'closed') OR cv.status = $1)
           AND ($2::uuid IS NULL OR cv.channel_id = $2)
           AND ($3::timestamptz IS NULL OR ($10::uuid IS NULL AND ${sortTime} < $3) OR ($10::uuid IS NOT NULL AND (${sortTime},cv.id)<($3,$10)))
           AND ($5::text IS NULL OR ($5 = 'unassigned' AND cv.assigned_to IS NULL) OR ($5 = 'user' AND cv.assigned_to = $6::uuid))
           AND ($7::text IS NULL OR cv.handled_by = $7)
           AND (NOT $8::boolean OR cv.unread_count > 0)
           AND (($11='archived' AND cv.archived_at IS NOT NULL) OR ($11='blocked' AND EXISTS(SELECT 1 FROM contact_channels bc WHERE bc.contact_id=cv.contact_id AND bc.channel_id=cv.channel_id AND bc.blocked_at IS NOT NULL)) OR ($11 IN ('all','important') AND cv.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM contact_channels bc WHERE bc.contact_id=cv.contact_id AND bc.channel_id=cv.channel_id AND bc.blocked_at IS NOT NULL) AND ($11='all' OR cv.important)))
           AND ($9::text IS NULL OR ct.name ILIKE $9 OR ct.phone ILIKE $9 OR EXISTS (
                 SELECT 1 FROM messages m WHERE m.conversation_id = cv.id AND m.is_internal = false AND m.content->>'text' ILIKE $9))
           AND ($12::text IS NULL OR $12=ANY(ct.tags))
           AND ($13::uuid IS NULL OR EXISTS(SELECT 1 FROM sequence_enrollments se WHERE se.contact_id=ct.id AND se.sequence_id=$13))
           AND ($14::timestamptz IS NULL OR ${sortTime}>=$14)
           AND ($15::timestamptz IS NULL OR ${sortTime}<=$15)
           AND (NOT $16::boolean OR (cv.handled_by='human' AND (SELECT m.direction FROM messages m WHERE m.conversation_id=cv.id AND NOT m.is_internal ORDER BY m.seq DESC LIMIT 1)='in'))
         ORDER BY ${sortTime} DESC,cv.id DESC LIMIT $4`,
        [
          q.status ?? null,
          q.channelId ?? null,
          cursor?.at ?? q.before ?? null,
          q.limit,
          assigneeMode,
          assigneeId,
          q.handledBy ?? null,
          q.unread === 'true',
          pattern,
          cursor?.id ?? null,
          q.view,
          q.tag ?? null,
          q.sequenceId ?? null,
          q.from ?? null,
          q.to ?? null,
          q.needsReply === 'true',
        ],
      );
      return {
        items: r.rows,
        nextBefore: r.rows.length === q.limit ? r.rows[r.rows.length - 1].last_message_at : null,
        nextCursor:
          r.rows.length === q.limit
            ? Buffer.from(
                JSON.stringify({
                  at: r.rows[r.rows.length - 1].cursor_at,
                  id: r.rows[r.rows.length - 1].id,
                }),
              ).toString('base64url')
            : null,
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

  @Get('conversations/filter-options')
  filterOptions(@Req() req: AuthedRequest) {
    return this.db.withTenant(req.user.tenantId, async (c) => ({
      labels: (
        await c.query(
          'SELECT DISTINCT unnest(tags) AS name FROM contacts WHERE archived_at IS NULL AND merged_into_id IS NULL ORDER BY name',
        )
      ).rows,
      sequences: (await c.query('SELECT id,name FROM sequences ORDER BY name')).rows,
    }));
  }

  @Get('conversations/counts')
  counts(@Req() req: AuthedRequest, @Query() query: unknown) {
    const { channelId } = parse(z.object({ channelId: z.string().uuid().optional() }), query);
    return this.db.withTenant(
      req.user.tenantId,
      async (c) =>
        (
          await c.query(
            `WITH scoped AS (SELECT cv.*,EXISTS(SELECT 1 FROM contact_channels cc WHERE cc.contact_id=cv.contact_id AND cc.channel_id=cv.channel_id AND cc.blocked_at IS NOT NULL) AS blocked FROM conversations cv WHERE ($2::uuid IS NULL OR cv.channel_id=$2))
       SELECT count(*) FILTER(WHERE status<>'closed' AND archived_at IS NULL AND NOT blocked)::int AS active,
       count(*) FILTER(WHERE status<>'closed' AND archived_at IS NULL AND NOT blocked AND assigned_to=$1)::int AS mine,
       count(*) FILTER(WHERE status<>'closed' AND archived_at IS NULL AND NOT blocked AND assigned_to IS NULL)::int AS unassigned,
       count(*) FILTER(WHERE status<>'closed' AND archived_at IS NULL AND NOT blocked AND unread_count>0)::int AS unread,
       count(*) FILTER(WHERE status<>'closed' AND archived_at IS NULL AND NOT blocked AND handled_by='bot')::int AS bot,
       count(*) FILTER(WHERE status='closed' AND archived_at IS NULL AND NOT blocked)::int AS closed,
       count(*) FILTER(WHERE important AND archived_at IS NULL AND NOT blocked)::int AS important,
       count(*) FILTER(WHERE archived_at IS NOT NULL)::int AS archived,count(*) FILTER(WHERE blocked)::int AS blocked FROM scoped`,
            [req.user.userId, channelId ?? null],
          )
        ).rows[0],
    );
  }

  @Get('conversations/:id')
  detail(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const r = (
        await c.query(
          `SELECT cv.id,cv.important,cv.archived_at,EXISTS(SELECT 1 FROM contact_channels bc WHERE bc.contact_id=cv.contact_id AND bc.channel_id=cv.channel_id AND bc.blocked_at IS NOT NULL) AS blocked, cv.status, cv.handled_by, cv.assigned_to, au.full_name AS assignee_name, cv.unread_count,
                  cv.last_inbound_at, cv.created_at,cv.department_id,
                  (SELECT d.sla_minutes FROM departments d WHERE d.id=cv.department_id) AS sla_minutes,
                  ch.id AS channel_id, ch.type AS channel_type, ch.name AS channel_name,
                  ct.id AS contact_id, ct.name AS contact_name, ct.phone AS contact_phone, ct.email AS contact_email,
                  ct.tags AS contact_tags,ct.lifecycle AS contact_lifecycle,ct.attributes AS contact_attributes, ct.created_at AS contact_since,
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
          ? new Date(new Date(r.last_inbound…15610 tokens truncated…المغلقة', 'View closed conversations')}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="stack">
                      <p>
                        {t(
                          'لا توجد محادثات بعد. ابدأ بربط قناة أو تجربة ويدجت الموقع.',
                          'No conversations yet. Connect a channel or try your website widget.',
                        )}
                      </p>
                      <Link className="btn" href="/dashboard/channels">
                        {t('القنوات وتجربة الويدجت', 'Channels and widget demo')}
                      </Link>
                    </div>
                  )}
                </li>
              )}
            </ul>
            {nextBefore && (
              <button className="p-3 border-t" disabled={loadingMore} onClick={moreConversations}>
                {loadingMore
                  ? t('جارٍ التحميل…', 'Loading…')
                  : t('تحميل محادثات أقدم', 'Load older conversations')}
              </button>
            )}
          </aside>

          {/* ---------- الخيط ---------- */}
          <section className={`${selId ? 'flex' : 'hidden lg:flex'} min-w-0 flex-1 flex-col`}>
            {detailLoading ? (
              <div className={styles.empty} role="status">
                {t('جارٍ تحميل المحادثة…', 'Loading conversation…')}
              </div>
            ) : !detail || !selId ? (
              <div className={styles.empty}>
                <img src="/navigation/shared-inbox.svg" alt="" />
                <h1>{t('صندوق الوارد المشترك', 'Shared Inbox')}</h1>
                <h2>
                  {t(
                    'كل قنواتك في صندوق وارد واحد',
                    'Connect Multiple Platforms – all in one inbox!',
                  )}
                </h2>
                <p>
                  {t(
                    'إدارة الرسائل من منصات متعددة في مكان واحد.',
                    'Easily manage messages from multiple platforms in a single inbox.',
                  )}
                </p>
              </div>
            ) : (
              <>
                <header className={styles.threadHeader}>
                  <button
                    type="button"
                    className={styles.back}
                    aria-label={t('رجوع للقائمة', 'Back to list')}
                    onClick={() => {
                      if (selRef.current)
                        drafts.current.write(selRef.current, composerState.current);
                      selRef.current = null;
                      setSelId(null);
                      setDetail(null);
                    }}
                  >
                    <NavIcon name="undo" />
                  </button>
                  <span className={styles.threadAvatar}>
                    {String(title(detail)).trim().charAt(0).toUpperCase()}
                  </span>
                  <div className={styles.threadIdentity}>
                    <strong>
                      {title(detail)}
                      {workspaceRole !== 'agent' && (
                        <button
                          type="button"
                          className={styles.editName}
                          aria-label={t('تعديل اسم العميل', 'Edit customer name')}
                          onClick={() => setEditingContact('name')}
                        >
                          <NavIcon name="edit" />
                        </button>
                      )}
                    </strong>
                    <small>{detail.contact_phone || detail.channel_name}</small>
                  </div>
                  <div className={styles.threadTools}>
                    <button
                      type="button"
                      aria-label={t('بحث الرسائل', 'Search messages')}
                      aria-expanded={searchMessages}
                      onClick={() => setSearchMessages((v) => !v)}
                    >
                      <NavIcon name="search" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('تعيين متابعة', 'Set Follow-up')}
                      onClick={() => setFollowupOpen(true)}
                    >
                      <NavIcon name="stopwatch" />
                    </button>
                    <button
                      type="button"
                      className={styles.threadActionTrigger}
                      aria-label={t('إجراءات المحادثة', 'Chat actions')}
                      title={t('فتح إجراءات المحادثة وبيانات العميل', 'Open chat actions and customer details')}
                      aria-expanded={actionsOpen || showContext}
                      onClick={() => {
                        if (window.matchMedia('(min-width: 1024px)').matches)
                          setActionsOpen((value) => !value);
                        else setShowContext(true);
                      }}
                    >
                      <NavIcon name="moreVertical" />
                      <span aria-hidden="true" className={styles.actionLabel}>{t('إجراءات', 'Actions')}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={t('إظهار معلومات العميل', 'Toggle customer info')}
                      aria-expanded={infoOpen}
                      onClick={() => setInfoOpen((v) => !v)}
                    >
                      <NavIcon name="chevron" />
                    </button>
                  </div>
                </header>
                {infoOpen && (
                  <dl className={styles.customerStrip}>
                    {[
                      [
                        t('عميل منذ', 'Customer Since'),
                        detail.contact_since
                          ? new Date(detail.contact_since).toLocaleDateString(
                              language === 'ar' ? 'ar-EG' : 'en-US',
                            )
                          : '—',
                        'userClock',
                      ],
                      [
                        t('آخر ظهور', 'Last Seen'),
                        detail.last_inbound_at
                          ? new Date(detail.last_inbound_at).toLocaleString(
                              language === 'ar' ? 'ar-EG' : 'en-US',
                            )
                          : '—',
                        'eye',
                      ],
                      [
                        t('اللغة', 'Language'),
                        detail.contact_attributes?.language || '—',
                        'language',
                      ],
                      [t('البلد', 'Country'), detail.contact_attributes?.country || '—', 'pin'],
                      [
                        t('المنطقة الزمنية', 'Timezone'),
                        detail.contact_attributes?.timezone || '—',
                        'sessions',
                      ],
                    ].map(([label, value, icon]) => (
                      <div key={label}>
                        <NavIcon name={icon} />
                        <dt>{label}</dt>
                        <dd title={value}>{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {searchMessages && (
                  <input
                    className={styles.messageSearch}
                    aria-label={t('بحث داخل الرسائل المحملة', 'Search loaded messages')}
                    placeholder={t('بحث داخل الرسائل المحملة…', 'Search loaded messages…')}
                    value={messageSearch}
                    onChange={(e) => setMessageSearch(e.target.value)}
                  />
                )}

                {notice && (
                  <p className="handoff-notice" role="status">
                    ✓ {notice}
                  </p>
                )}
                {acting && (
                  <p className="handoff-notice is-busy" role="status">
                    {t('جارٍ التنفيذ…', 'Working…')}
                  </p>
                )}
                <div ref={threadScroll} className="thread-msgs flex-1 overflow-y-auto p-3">
                  {hasMore && (
                    <button
                      onClick={loadOlder}
                      disabled={olderLoading}
                      className="mx-auto mb-2 block rounded border bg-white px-3 py-1 text-xs"
                    >
                      {t('تحميل رسائل أقدم', 'Load older messages')}
                    </button>
                  )}
                  {msgs
                    .filter(
                      (m) =>
                        !messageSearch.trim() ||
                        preview(m.content)
                          .toLocaleLowerCase()
                          .includes(messageSearch.trim().toLocaleLowerCase()),
                    )
                    .map((m, index, visibleMessages) => {
                      const created = new Date(m.created_at ?? m.createdAt);
                      const previous = index > 0
                        ? new Date(visibleMessages[index - 1].created_at ?? visibleMessages[index - 1].createdAt)
                        : null;
                      const startsDay = !previous || created.toDateString() !== previous.toDateString();
                      return (
                        <Fragment key={m.id}>
                          {startsDay && (
                            <div className="msg-day-separator" role="separator">
                              {created.toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </div>
                          )}
                          <MessageBubble m={m} conversationId={selId} name={nameOf} />
                        </Fragment>
                      );
                    })}
                  <div ref={bottom} />
                </div>

                <div className={`composer border-t bg-white p-2 ${internal ? 'is-note' : ''}`}>
                  <div
                    className="composer-modes"
                    role="group"
                    aria-label={t('نوع الرسالة', 'Message type')}
                  >
                    <button
                      type="button"
                      aria-pressed={!internal}
                      className={!internal ? 'is-on' : ''}
                      onClick={() => setInternal(false)}
                    >
                      {t('رد', 'Reply')}
                    </button>
                    <button
                      type="button"
                      aria-pressed={internal}
                      className={internal ? 'is-on is-note' : ''}
                      onClick={() => setInternal(true)}
                    >
                      {t('ملاحظة', 'Note')}
                    </button>
                  </div>
                  {internal && (
                    <p className="composer-note-banner" role="status">
                      {t(
                        'ملاحظة داخلية — لن يراها العميل.',
                        'Internal note — the customer will not see this.',
                      )}
                    </p>
                  )}
                  {error && (
                    <p className="mb-1 text-xs text-red-600" role="alert">
                      {error}
                    </p>
                  )}
                  {replyUnavailable && !internal && (
                    <div className="mb-1 rounded bg-amber-50 p-2 text-xs text-amber-800">
                      <p role="status">
                        {detail.blocked
                          ? t(
                              'المحادثة محظورة. يمكنك إضافة ملاحظة داخلية.',
                              'This conversation is blocked. You can add an internal note.',
                            )
                          : t(
                              'انتهت نافذة واتساب. الرد الحر معطّل؛ يمكنك كتابة ملاحظة داخلية أو استخدام قالب معتمد من مسار الحملات.',
                              'The WhatsApp window has expired. Free-form replies are disabled; add an internal note or use an approved template through campaigns.',
                            )}
                      </p>
                      <button type="button" className="btn mt-2" onClick={() => setInternal(true)}>
                        {t('إضافة ملاحظة داخلية', 'Add internal note')}
                      </button>
                    </div>
                  )}
                  {detail.handled_by === 'bot' && !internal && (
                    <p className="sr-only" id="inbox-takeover-hint">
                      {t(
                        'البوت يتولى هذه المحادثة. إرسال رد يستلمها تلقائيًا.',
                        'The bot handles this conversation. Sending a reply takes over automatically.',
                      )}
                    </p>
                  )}
                  {suggestions.length > 0 && (
                    <ul
                      className="composer-suggest mb-1 rounded border bg-white shadow"
                      aria-label={t('الردود الجاهزة', 'Saved replies')}
                    >
                      {suggestions.map((s) => (
                        <li
                          key={s.id}
                          onClick={() => fill(s)}
                          className="cursor-pointer px-2 py-1 hover:bg-gray-100"
                        >
                          <strong>/{s.shortcut}</strong> — {s.title}
                        </li>
                      ))}
                    </ul>
                  )}
                  {attach && (
                    <div className="composer-attached mb-1 flex items-center gap-2 rounded bg-gray-100 px-2 py-1 text-xs">
                      <NavIcon name="knowledge" /> {attach.filename}
                      <button
                        aria-label={t('إزالة المرفق', 'Remove attachment')}
                        onClick={() => setAttach(null)}
                        className="text-red-600"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <div className="composer-row" hidden={replyUnavailable && !internal}>
                    <textarea
                      ref={composerInput}
                      aria-label={t('محرر الرد', 'Reply composer')}
                      aria-describedby={
                        detail.handled_by === 'bot' && !internal ? 'inbox-takeover-hint' : undefined
                      }
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          send();
                        }
                      }}
                      rows={2}
                      disabled={!internal && (!!windowExpired || !!detail?.blocked)}
                      placeholder={
                        internal
                          ? t(
                              'اكتب ملاحظة داخلية (لا يراها العميل)…',
                              'Write an internal note (hidden from customer)…',
                            )
                          : t(
                              'اكتب ردّاً… (اكتب / للردود الجاهزة)',
                              'Write a reply… (type / for saved replies)',
                            )
                      }
                      className="composer-input flex-1 rounded border p-2"
                    />
                    {!internal && (
                      <div ref={emojiHost} className={styles.emojiHost}>
                        <button
                          type="button"
                          className={styles.emojiButton}
                          aria-label={t('رموز تعبيرية', 'Emoji')}
                          aria-expanded={emojiOpen}
                          disabled={!!windowExpired || !!detail.blocked}
                          onClick={() => setEmojiOpen((value) => !value)}
                        >
                          <NavIcon name="smile" />
                        </button>
                        {emojiOpen && (
                          <div
                            className={styles.emojiPicker}
                            role="group"
                            aria-label={t('اختيار رمز تعبيري', 'Choose emoji')}
                          >
                            {[
                              '😀',
                              '😊',
                              '😍',
                              '👍',
                              '🙏',
                              '❤️',
                              '🎉',
                              '✅',
                              '👋',
                              '🌹',
                              '🤝',
                              '🤔',
                            ].map((emoji) => (
                              <button
                                type="button"
                                key={emoji}
                                aria-label={emoji}
                                onClick={() => {
                                  const input = composerInput.current;
                                  const start = input?.selectionStart ?? text.length;
                                  const end = input?.selectionEnd ?? text.length;
                                  setText(text.slice(0, start) + emoji + text.slice(end));
                                  setEmojiOpen(false);
                                  requestAnimationFrame(() => {
                                    input?.focus();
                                    input?.setSelectionRange(
                                      start + emoji.length,
                                      start + emoji.length,
                                    );
                                  });
                                }}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="composer-actions">
                      <label
                        className={`composer-attach ${internal ? 'is-disabled' : ''}`}
                        title={t('إرفاق ملف', 'Attach file')}
                      >
                        <NavIcon name="plus" />
                        <span className="sr-only">{t('إرفاق', 'Attach')}</span>
                        <input
                          aria-label={t('إرفاق ملف', 'Attach file')}
                          type="file"
                          hidden
                          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                          disabled={internal || uploading || !!windowExpired || !!detail.blocked}
                        />
                      </label>
                      <button
                        onClick={send}
                        disabled={
                          busy ||
                          uploading ||
                          (!text.trim() && (internal || !attach)) ||
                          (!internal && (!!detail?.blocked || !!windowExpired))
                        }
                        className={`composer-send ${internal ? 'is-note' : ''}`}
                      >
                        {busy ? (
                          '…'
                        ) : internal ? (
                          t('حفظ الملاحظة', 'Save note')
                        ) : (
                          <>
                            <NavIcon name="campaigns" />
                            <span className="sr-only">{t('إرسال', 'Send')}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>

          {detail && (
            <>
              <InboxFollowupDialog
                key={`followup-${detail.id}`}
                open={followupOpen}
                detail={detail}
                onClose={() => setFollowupOpen(false)}
                onSaved={async () => {
                  setProfileRefresh((value) => value + 1);
                }}
              />
              <InboxContactDialog
                key={`contact-${detail.id}`}
                field={editingContact}
                contactId={detail.contact_id}
                onClose={() => setEditingContact(null)}
                onSaved={async () => {
                  const id = selRef.current;
                  if (!id) return;
                  const updated = await api(`/conversations/${id}`);
                  if (selRef.current === id) {
                    setDetail(updated);
                    setProfileRefresh((value) => value + 1);
                  }
                  await loadList();
                }}
              />
            </>
          )}
          {/* ---------- تفاصيل العميل ---------- */}
          <div className="hidden lg:contents">{actionsOpen && !showContext && customerPanel}</div>
          {showContext && !!detail && (
            <Dialog
              open={true}
              onClose={() => setShowContext(false)}
              title={t('ملف العميل', 'Customer profile')}
            >
              {customerPanel}
            </Dialog>
          )}
        </div>
      </div>
    </div>
  );
}
