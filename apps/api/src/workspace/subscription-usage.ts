import type { PoolClient } from 'pg';
import type { TenantPlan } from '../plans/plans.service';

/** Read the same counters and calendar-month boundaries used by the write paths. */
export async function subscriptionUsage(c: PoolClient, plan: TenantPlan) {
  const { rows: [row] } = await c.query(`
    SELECT now() AS "asOf",
      date_trunc('month',now()) AS "cycleStart",
      date_trunc('month',now()) + interval '1 month' AS "cycleEnd",
      (SELECT count(*)::int FROM contacts) AS contacts,
      (SELECT count(*)::int FROM memberships) AS agents,
      (SELECT count(*)::int FROM channels) AS channels,
      (SELECT count(*)::int FROM flows) AS flows,
      (SELECT count(*)::int FROM flows WHERE NOT is_component) AS bots,
      (SELECT count(*)::int FROM messages WHERE direction='out' AND NOT is_internal
        AND created_at >= date_trunc('month',now())) AS messages,
      COALESCE(g.baseline_calls+g.attempts,a.replies,0) AS attempts,
      COALESCE(g.charged_tokens,a.input_tokens+a.output_tokens,0)::text AS "chargedTokens",
      COALESCE(g.reserved_tokens,0)::text AS "reservedTokens",
      COALESCE(g.charged_cost_microusd,0)::text AS "knownCostMicrousd",
      COALESCE(g.reserved_cost_microusd,0)::text AS "reservedCostMicrousd",
      gp.monthly_calls AS "policyCalls", gp.monthly_tokens::text AS "policyTokens",
      gp.monthly_cost_microusd::text AS "costLimitMicrousd"
    FROM (SELECT 1) seed
    LEFT JOIN generation_usage g ON g.period=date_trunc('month',now())::date
    LEFT JOIN ai_usage a ON a.period=date_trunc('month',now())::date
    LEFT JOIN generation_policy gp ON true
  `);
  const cap = (planLimit: number, policyLimit: number | null) =>
    policyLimit == null ? planLimit : planLimit === -1 ? policyLimit : Math.min(planLimit, policyLimit);
  const meter = (used: number, limit: number) => ({
    used, limit, remaining: limit === -1 ? null : Math.max(0, limit - used),
    percent: limit === -1 ? null : limit === 0 ? (used ? 100 : 0) : used / limit * 100,
  });
  return {
    asOf: row.asOf, cycleStart: row.cycleStart, cycleEnd: row.cycleEnd, plan,
    resources: {agents:meter(row.agents,plan.limits.agents??-1),channels:meter(row.channels,plan.limits.channels??-1),flows:meter(row.flows,plan.limits.flows??-1),bots:row.bots},
    messages: meter(row.messages, plan.limits.messages_per_month ?? 0),
    contacts: meter(row.contacts, plan.limits.contacts ?? 0),
    ai: meter(row.attempts, cap(plan.limits.ai_credits ?? 0, row.policyCalls)),
    tokens: meter(Number(row.chargedTokens) + Number(row.reservedTokens),
      cap(plan.limits.generation_token_budget ?? -1, row.policyTokens == null ? null : Number(row.policyTokens))),
    reservedTokens: row.reservedTokens,
    knownCostMicrousd: row.knownCostMicrousd, reservedCostMicrousd: row.reservedCostMicrousd,
    costLimitMicrousd: row.costLimitMicrousd,
  };
}

export async function subscriptionHistory(c: PoolClient) {
  const { rows: [row] } = await c.query(`
    WITH bounds AS (
      SELECT date_trunc('month',now()) AS start, date_trunc('day',now()) AS today
    ), messages_by_day AS (
      SELECT date_trunc('day',m.created_at) AS day, count(*)::int AS count
      FROM messages m, bounds b WHERE m.direction='out' AND NOT m.is_internal
        AND m.created_at >= b.start - interval '1 month' GROUP BY 1
    )
    SELECT
      COALESCE((SELECT json_agg(json_build_object('day',d.day::date::text,'count',COALESCE(m.count,0)) ORDER BY d.day)
        FROM bounds b CROSS JOIN LATERAL generate_series(b.start,b.today,interval '1 day') d(day)
        LEFT JOIN messages_by_day m ON m.day=d.day),'[]'::json) AS days,
      COALESCE((SELECT sum(m.count)::int FROM messages_by_day m WHERE m.day=b.today),0) AS today,
      COALESCE((SELECT sum(m.count)::int FROM messages_by_day m WHERE m.day>=b.today-interval '6 days'),0) AS "lastSeven",
      COALESCE((SELECT sum(m.count)::int FROM messages_by_day m WHERE m.day<b.start),0) AS previous,
      COALESCE((SELECT baseline_calls+attempts FROM generation_usage g WHERE g.period=(b.start-interval '1 month')::date),
        (SELECT replies FROM ai_usage a WHERE a.period=(b.start-interval '1 month')::date),0) AS "previousAi"
    FROM bounds b
  `);
  return row;
}
