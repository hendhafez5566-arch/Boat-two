import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pagination } from './schemas';

export const campaignScopeSchema = z.object({
  channelId: z.string().uuid().optional(),
  channelType: z.enum(['whatsapp', 'facebook', 'telegram', 'instagram', 'web']).optional(),
});
export const campaignListSchema = pagination.merge(campaignScopeSchema).extend({
  status: z
    .enum(['draft', 'scheduled', 'running', 'completed', 'canceled', 'cancelled'])
    .optional(),
  q: z.string().max(120).default(''),
  sort: z.enum(['createdAt', 'name', 'status', 'scheduledAt']).default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  paginated: z.enum(['true', 'false']).default('false'),
});
type Scope = z.infer<typeof campaignScopeSchema>;
const scoped = '($1::uuid IS NULL OR p.channel_id=$1) AND ($2::text IS NULL OR ch.type=$2)';
export async function campaignList(
  c: Pick<PoolClient, 'query'>,
  q: z.infer<typeof campaignListSchema>,
) {
  const orderColumn = {
    createdAt: 'p.created_at',
    name: 'lower(p.name)',
    status: 'p.status',
    scheduledAt: 'p.scheduled_at',
  }[q.sort];
  const orderDirection = q.direction === 'asc' ? 'ASC' : 'DESC';
  const status = q.status === 'cancelled' ? 'canceled' : q.status;
  const params = [q.channelId ?? null, q.channelType ?? null, status ?? null, q.q.trim() || null];
  const where = `${scoped} AND ($3::text IS NULL OR p.status=$3) AND ($4::text IS NULL OR strpos(lower(p.name),lower($4))>0)`;
  const items = (
    await c.query(
      `SELECT p.*,ch.name AS channel_name,ch.type AS channel_type,
    (SELECT count(*)::int FROM campaign_recipients WHERE campaign_id=p.id) AS recipients,
    (SELECT jsonb_build_object('processed',count(*) FILTER(WHERE r.status<>'pending'),'delivered',count(*) FILTER(WHERE m.status IN ('delivered','read')),'read',count(*) FILTER(WHERE m.status='read'),'failed',count(*) FILTER(WHERE r.status='failed' OR m.status='failed')) FROM campaign_recipients r LEFT JOIN messages m ON m.id=r.message_id WHERE r.campaign_id=p.id) AS metrics
    FROM campaigns p JOIN channels ch ON ch.id=p.channel_id WHERE ${where}
    ORDER BY ${orderColumn} ${orderDirection} NULLS LAST,p.id LIMIT $5 OFFSET $6`,
      [
        ...params,
        q.paginated === 'true' ? q.limit : 100,
        q.paginated === 'true' ? (q.page - 1) * q.limit : 0,
      ],
    )
  ).rows;
  if (q.paginated !== 'true') return items;
  const total = (
    await c.query(
      `SELECT count(*)::int AS n FROM campaigns p JOIN channels ch ON ch.id=p.channel_id WHERE ${where}`,
      params,
    )
  ).rows[0].n;
  return {
    items,
    total,
    page: q.page,
    limit: q.limit,
    filters: {
      channelId: q.channelId || '',
      channelType: q.channelType || '',
      status: status || '',
      q: q.q.trim(),
      sort: q.sort,
      direction: q.direction,
    },
  };
}
export async function campaignSummary(
  c: Pick<PoolClient, 'query'>,
  scope: Scope,
  now = new Date(),
) {
  const params = [scope.channelId ?? null, scope.channelType ?? null, now.toISOString()];
  const where = `${scoped} AND p.created_at >= $3::timestamptz - interval '30 days' AND p.created_at <= $3::timestamptz`;
  const campaigns = (
    await c.query(
      `SELECT count(*)::int AS total,count(*) FILTER(WHERE p.status='completed')::int AS completed FROM campaigns p JOIN channels ch ON ch.id=p.channel_id WHERE ${where}`,
      params,
    )
  ).rows[0];
  const messages = (
    await c.query(
      `SELECT count(*) FILTER(WHERE m.status IN ('sent','delivered','read'))::int AS sent,count(*) FILTER(WHERE m.status IN ('delivered','read'))::int AS delivered,count(*) FILTER(WHERE m.status='read')::int AS read,count(*) FILTER(WHERE r.status='failed' OR m.status='failed')::int AS failed FROM campaign_recipients r JOIN campaigns p ON p.id=r.campaign_id JOIN channels ch ON ch.id=p.channel_id LEFT JOIN messages m ON m.id=r.message_id WHERE ${where}`,
      params,
    )
  ).rows[0];
  return {
    ...campaigns,
    ...messages,
    readRate: messages.delivered
      ? Math.round((messages.read / messages.delivered) * 10000) / 100
      : null,
    days: 30,
    filters: { channelId: scope.channelId || '', channelType: scope.channelType || '' },
  };
}
