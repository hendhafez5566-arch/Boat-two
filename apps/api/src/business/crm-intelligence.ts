import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { crmDate } from './crm-overview';
import { DatabaseService } from '../database/database.service';
export const analyticsQuery = z
  .object({
    from: crmDate.optional(),
    to: crmDate.optional(),
    ownerId: z.string().uuid().optional(),
    mine: z.enum(['true', 'false']).optional(),
  })
  .refine(
    (q) =>
      !q.from ||
      !q.to ||
      (q.from <= q.to && (Date.parse(q.to) - Date.parse(q.from)) / 86400000 <= 366),
    'Choose a valid period of at most 367 days',
  );
export const scoringSchema = z
  .object({
    qualified: z.number().int().min(0).max(100),
    email: z.number().int().min(0).max(100),
    phone: z.number().int().min(0).max(100),
    openDeal: z.number().int().min(0).max(100),
    interestTag: z.string().trim().max(50),
    tag: z.number().int().min(0).max(100),
  })
  .strict();
export const defaultScoring = {
  qualified: 30,
  email: 10,
  phone: 10,
  openDeal: 30,
  interestTag: 'interested',
  tag: 20,
};
export async function crmAnalytics(
  db: DatabaseService,
  user: { tenantId: string; userId: string; role: string },
  input: z.infer<typeof analyticsQuery>,
) {
  return db.withTenant(user.tenantId, async (c) => {
    const settings = (await c.query('SELECT settings FROM tenants')).rows[0]?.settings || {};
    let timezone = typeof settings.timezone === 'string' ? settings.timezone : 'UTC';
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone });
    } catch {
      timezone = 'UTC';
    }
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const part = (name: string) => parts.find((p) => p.type === name)?.value;
    const today = `${part('year')}-${part('month')}-${part('day')}`;
    const to = input.to || today,
      from = input.from || new Date(Date.parse(to) - 29 * 86400000).toISOString().slice(0, 10);
    if (from > to || Date.parse(to) - Date.parse(from) > 366 * 86400000)
      throw new BadRequestException('Invalid reporting period');
    const owner =
      user.role === 'agent' || input.mine === 'true' ? user.userId : input.ownerId || null;
    const args = [from, to, timezone, owner];
    const active = 'merged_into_id IS NULL AND archived_at IS NULL';
    const date = (col: string) =>
      `${col} >= ($1::date::timestamp AT TIME ZONE $3) AND ${col} < (($2::date+1)::timestamp AT TIME ZONE $3)`;
    const rows = async (sql: string) =>
      (
        await c.query(
          'WITH _period AS (SELECT $1::date AS start,$2::date AS finish,$3::text AS zone,$4::uuid AS actor) ' +
            sql,
          args,
        )
      ).rows;
    // Independent aggregates avoid multiplication by conversation/task joins.
    const contacts = (
      await rows(
        `SELECT count(*)::int AS total,count(*) FILTER(WHERE ${date('created_at')})::int AS new,count(*) FILTER(WHERE lifecycle='lead')::int AS leads,count(*) FILTER(WHERE lifecycle='qualified')::int AS qualified,count(*) FILTER(WHERE owner_id IS NULL)::int AS unassigned,count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM crm_tasks t WHERE t.contact_id=contacts.id AND t.status='open'))::int AS unattended FROM contacts WHERE ${active} AND ($4::uuid IS NULL OR owner_id=$4)`,
      )
    )[0];
    const sales = await rows(
      `SELECT currency,status,count(*)::int AS count,COALESCE(sum(value_cents),0)::text AS value_cents FROM crm_deals WHERE ($4::uuid IS NULL OR owner_id=$4) AND ${date('updated_at')} GROUP BY currency,status ORDER BY currency,status`,
    );
    const pipeline = await rows(
      `SELECT pipeline_id,stage,currency,count(*)::int AS count,sum(value_cents)::text AS value_cents FROM crm_deals WHERE status='open' AND ($4::uuid IS NULL OR owner_id=$4) AND ${date('updated_at')} GROUP BY pipeline_id,stage,currency`,
    );
    const followups = (
      await rows(
        `SELECT count(*) FILTER(WHERE status='open')::int AS open,count(*) FILTER(WHERE status='open' AND due_at<now())::int AS overdue,count(*) FILTER(WHERE status='open' AND due_at >= (now() AT TIME ZONE $3)::date::timestamp AT TIME ZONE $3 AND due_at < (((now() AT TIME ZONE $3)::date+1)::timestamp AT TIME ZONE $3))::int AS today,count(*) FILTER(WHERE status='done' AND ${date('updated_at')})::int AS done FROM crm_tasks WHERE ($4::uuid IS NULL OR assigned_to=$4)`,
      )
    )[0];
    const sources = await rows(
      `SELECT COALESCE(NULLIF(attributes->>'source',''),'Unknown') AS source,count(*)::int AS count FROM contacts WHERE ${active} AND ($4::uuid IS NULL OR owner_id=$4) AND ${date('created_at')} GROUP BY 1 ORDER BY count DESC,source LIMIT 30`,
    );
    const losses = await rows(
      `SELECT COALESCE(NULLIF(loss_reason,''),'Unknown') AS reason,count(*)::int AS count FROM crm_deals WHERE status='lost' AND ($4::uuid IS NULL OR owner_id=$4) AND ${date('updated_at')} GROUP BY 1 ORDER BY count DESC LIMIT 30`,
    );
    const growth = await rows(
      `SELECT day::date::text AS day,(day::timestamp AT TIME ZONE $3) AS start_at,((day+interval '1 day')::timestamp AT TIME ZONE $3) AS end_at,(SELECT count(*)::int FROM contacts ct WHERE ct.merged_into_id IS NULL AND ct.archived_at IS NULL AND ($4::uuid IS NULL OR ct.owner_id=$4) AND ct.created_at >= (day::timestamp AT TIME ZONE $3) AND ct.created_at < ((day+interval '1 day')::timestamp AT TIME ZONE $3)) AS count FROM generate_series($1::date,$2::date,interval '1 day') day`,
    );
    const employees = await rows(
      `SELECT m.user_id,u.full_name,(SELECT count(*)::int FROM crm_tasks t WHERE t.assigned_to=m.user_id AND t.status='open' AND t.due_at<now()) AS overdue,(SELECT count(*)::int FROM crm_tasks t WHERE t.assigned_to=m.user_id AND t.status='done' AND ${date('t.updated_at')}) AS completed,(SELECT count(*)::int FROM crm_deals d WHERE d.owner_id=m.user_id AND d.status='won' AND ${date('d.updated_at')}) AS won FROM memberships m JOIN users u ON u.id=m.user_id WHERE ($4::uuid IS NULL OR m.user_id=$4) ORDER BY u.full_name`,
    );
    const attention = await rows(
      `SELECT id,name,owner_id FROM contacts WHERE ${active} AND ($4::uuid IS NULL OR owner_id=$4) AND lifecycle IN ('lead','qualified') AND NOT EXISTS(SELECT 1 FROM crm_tasks t WHERE t.contact_id=contacts.id AND t.status='open') ORDER BY updated_at,id LIMIT 8`,
    );
    const conversations = (
      await rows(
        `SELECT count(*)::int AS needs_reply FROM conversations WHERE status<>'closed' AND archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM contact_channels cc WHERE cc.contact_id=conversations.contact_id AND cc.channel_id=conversations.channel_id AND cc.blocked_at IS NOT NULL) AND handled_by='human' AND ($4::uuid IS NULL OR assigned_to=$4) AND EXISTS(SELECT 1 FROM messages m WHERE m.id=(SELECT id FROM messages WHERE conversation_id=conversations.id AND NOT is_internal ORDER BY seq DESC LIMIT 1) AND m.direction='in')`,
      )
    )[0];
    const bounds = (
      await rows(
        'SELECT ($1::date::timestamp AT TIME ZONE $3) AS start_at,(($2::date+1)::timestamp AT TIME ZONE $3) AS end_at',
      )
    )[0];
    return {
      startAt: bounds.start_at,
      endAt: bounds.end_at,
      contacts,
      sales,
      pipeline,
      followups,
      sources,
      losses,
      growth,
      employees,
      attention,
      conversations,
      from,
      to,
      today,
      timezone,
      scope: owner ? 'mine' : 'team',
      ownerId: owner,
      role: user.role,
      generatedAt: new Date().toISOString(),
    };
  });
}

export function evaluateScore(
  contact: { lifecycle: string; email?: string | null; phone?: string | null; tags: string[] },
  hasOpenDeal: boolean,
  rules: z.infer<typeof scoringSchema>,
) {
  const reasons = [
    { key: 'qualified', points: contact.lifecycle === 'qualified' ? rules.qualified : 0 },
    { key: 'email', points: contact.email ? rules.email : 0 },
    { key: 'phone', points: contact.phone ? rules.phone : 0 },
    { key: 'openDeal', points: hasOpenDeal ? rules.openDeal : 0 },
    {
      key: 'tag',
      points: rules.interestTag && contact.tags.includes(rules.interestTag) ? rules.tag : 0,
    },
  ].filter((r) => r.points > 0);
  return {
    score: Math.min(
      100,
      reasons.reduce((sum, r) => sum + r.points, 0),
    ),
    reasons,
    rules,
  };
}
