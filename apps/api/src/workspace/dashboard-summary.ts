import type { PoolClient } from 'pg';
import { z } from 'zod';

export const dashboardChannelSchema = z
  .enum(['whatsapp', 'telegram', 'facebook'])
  .default('whatsapp');

export async function dashboardSummary(
  c: Pick<PoolClient, 'query'>,
  channel: z.infer<typeof dashboardChannelSchema>,
  userId: string,
  externalAiEnabled: boolean,
  asOf = new Date(),
) {
  const growth = (
    await c.query(
      `
    WITH days AS (
      SELECT generate_series(
        (($2::timestamptz AT TIME ZONE 'UTC')::date - 29)::timestamp,
        (($2::timestamptz AT TIME ZONE 'UTC')::date)::timestamp,
        interval '1 day'
      ) AS day
    ), first_subscription AS (
      SELECT cc.contact_id, min(cc.created_at) AS created_at
      FROM contact_channels cc JOIN channels ch ON ch.id=cc.channel_id AND ch.tenant_id=cc.tenant_id
      WHERE ch.type=$1 GROUP BY cc.contact_id
    )
    SELECT day::date::text AS day,
      (SELECT count(*)::int FROM first_subscription s
       WHERE s.created_at >= day AT TIME ZONE 'UTC'
         AND s.created_at < (day + interval '1 day') AT TIME ZONE 'UTC') AS gain,
      (SELECT count(DISTINCT h.contact_id)::int FROM consent_history h
       JOIN channels ch ON ch.id=h.channel_id AND ch.tenant_id=h.tenant_id
       WHERE ch.type=$1 AND h.status='opted_out'
         AND h.created_at >= day AT TIME ZONE 'UTC'
         AND h.created_at < (day + interval '1 day') AT TIME ZONE 'UTC') AS drop
    FROM days ORDER BY day
  `,
      [channel, asOf.toISOString()],
    )
  ).rows;
  const ai = (
    await c.query(
      `SELECT
    ($1::boolean AND (
      COALESCE((SELECT enabled FROM ai_settings LIMIT 1), false)
      OR EXISTS(SELECT 1 FROM ai_agents a JOIN ai_providers p ON p.id=a.provider_id AND p.tenant_id=a.tenant_id WHERE a.enabled AND p.enabled)
    )) AS enabled,
    (SELECT count(*)::int FROM knowledge_sources WHERE archived_at IS NULL) AS sources,
    (SELECT max(j.updated_at) FROM knowledge_jobs j JOIN knowledge_sources s ON s.id=j.source_id AND s.tenant_id=j.tenant_id WHERE j.status='completed' AND s.archived_at IS NULL) AS last_training
  `,
      [externalAiEnabled],
    )
  ).rows[0];
  const user = (await c.query('SELECT full_name FROM users WHERE id=$1', [userId])).rows[0];
  return { channel, growth, ai, userName: user?.full_name || '', timezone: 'UTC' };
}
