import { Controller, Get, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { DatabaseService } from '../database/database.service';
@Controller('reports')
@Roles('owner', 'admin')
export class ReportsController {
  constructor(private db: DatabaseService) {}
  @Get() report(@Req() r: AuthedRequest, @Query() query: unknown) {
    const input = parse(
      z
        .object({ from: z.string().datetime(), to: z.string().datetime() })
        .refine(
          (x) =>
            Date.parse(x.to) > Date.parse(x.from) &&
            Date.parse(x.to) - Date.parse(x.from) <= 366 * 86400000,
          'Choose a date range of at most 366 days',
        ),
      query,
    );
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const params = [input.from, input.to];
      const rows = async (sql: string) => (await c.query(sql, params)).rows;
      const daily = await rows(
        `SELECT date_trunc('day',created_at AT TIME ZONE 'UTC')::date::text AS day,count(*) FILTER(WHERE direction='in')::int AS inbound,count(*) FILTER(WHERE direction='out' AND NOT is_internal)::int AS outbound,count(*) FILTER(WHERE status='failed')::int AS failed FROM messages WHERE created_at >= $1 AND created_at < $2 GROUP BY 1 ORDER BY 1`,
      );
      const channels = await rows(
        `SELECT ch.name,ch.type,count(m.id)::int AS messages,count(m.id) FILTER(WHERE m.direction='in')::int AS inbound,count(m.id) FILTER(WHERE m.direction='out' AND NOT m.is_internal)::int AS outbound,count(m.id) FILTER(WHERE m.status='failed')::int AS failed FROM channels ch LEFT JOIN messages m ON m.channel_id=ch.id AND m.created_at >= $1 AND m.created_at < $2 GROUP BY ch.id ORDER BY messages DESC`,
      );
      const employees = await rows(
        `SELECT u.full_name,count(m.id)::int AS outbound_messages,count(DISTINCT m.conversation_id)::int AS conversations FROM messages m JOIN users u ON u.id=m.sender_user_id WHERE m.sender_type='agent' AND NOT m.is_internal AND m.created_at >= $1 AND m.created_at < $2 GROUP BY u.id ORDER BY outbound_messages DESC`,
      );
      const conversations = await rows(
        `SELECT status,handled_by,count(*)::int AS count FROM conversations WHERE created_at >= $1 AND created_at < $2 GROUP BY status,handled_by`,
      );
      const sales = await rows(
        `SELECT p.name AS pipeline,d.stage,d.status,d.currency,count(*)::int AS deals,sum(d.value_cents)::text AS value_cents FROM crm_deals d JOIN crm_pipelines p ON p.id=d.pipeline_id WHERE d.updated_at >= $1 AND d.updated_at < $2 GROUP BY p.name,d.stage,d.status,d.currency ORDER BY p.name,d.stage`,
      );
      const lifecycle = await rows(
        `SELECT lifecycle,count(*)::int AS contacts FROM contacts WHERE merged_into_id IS NULL AND created_at >= $1 AND created_at < $2 GROUP BY lifecycle`,
      );
      const campaigns = await rows(
        `SELECT p.id,p.name,p.status,count(r.id)::int AS recipients,count(r.id) FILTER(WHERE r.status='skipped')::int AS skipped,count(r.id) FILTER(WHERE r.status='failed' OR m.status='failed')::int AS failed,count(r.id) FILTER(WHERE m.status IN ('sent','delivered','read'))::int AS sent,count(r.id) FILTER(WHERE m.status IN ('delivered','read'))::int AS delivered,count(r.id) FILTER(WHERE m.status='read')::int AS read FROM campaigns p LEFT JOIN campaign_recipients r ON r.campaign_id=p.id LEFT JOIN messages m ON m.id=r.message_id WHERE p.created_at >= $1 AND p.created_at < $2 GROUP BY p.id ORDER BY p.created_at DESC LIMIT 1000`,
      );
      const ai = await rows(
        `SELECT COALESCE(a.name,'Default') AS agent,r.model,r.status,count(*)::int AS runs,sum(r.input_tokens)::text AS input_tokens,sum(r.output_tokens)::text AS output_tokens,sum(r.cost_microusd)::text AS estimated_cost_microusd,count(*) FILTER(WHERE r.cost_microusd IS NULL)::int AS unpriced_runs FROM ai_runs r LEFT JOIN ai_agents a ON a.id=r.agent_id WHERE r.created_at >= $1 AND r.created_at < $2 GROUP BY a.name,r.model,r.status`,
      );
      const bots = await rows(
        `SELECT f.name,s.status,count(*)::int AS sessions FROM flow_sessions s JOIN flows f ON f.id=s.flow_id WHERE s.created_at >= $1 AND s.created_at < $2 GROUP BY f.name,s.status ORDER BY sessions DESC`,
      );
      const automation = await rows(
        `SELECT a.name,r.status,count(*)::int AS runs FROM automation_runs r JOIN automation_rules a ON a.id=r.rule_id WHERE r.created_at >= $1 AND r.created_at < $2 GROUP BY a.name,r.status`,
      );
      const followups = await rows(
        `SELECT status,count(*)::int AS tasks,count(*) FILTER(WHERE status='open' AND due_at<now())::int AS overdue FROM crm_tasks WHERE due_at >= $1 AND due_at < $2 GROUP BY status`,
      );
      return {
        range: input,
        timezone: 'UTC',
        daily,
        channels,
        employees,
        conversations,
        sales,
        lifecycle,
        campaigns,
        ai,
        bots,
        automation,
        followups,
      };
    });
  }
}
