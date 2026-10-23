import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
type Tool = { name: string; input: Record<string, unknown> };
@Injectable()
export class AiToolExecution {
  constructor(private db: DatabaseService) {}
  async execute(
    tenant: string,
    run: string,
    agent: string | null,
    contact: string | undefined,
    handoffEnabled: boolean,
    tools: Tool[],
  ) {
    return this.db.withTenant(tenant, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,82))', [run]);
      if (!(await c.query('SELECT 1 FROM ai_runs WHERE id=$1', [run])).rowCount)
        throw new Error('AI run is outside the workspace');
      const current = agent
        ? (
            await c.query(
              'SELECT a.enabled,a.allowed_tools,p.enabled AS provider_enabled FROM ai_agents a LEFT JOIN ai_providers p ON p.id=a.provider_id WHERE a.id=$1 FOR SHARE OF a',
              [agent],
            )
          ).rows[0]
        : null;
      const allowed = agent
        ? current?.enabled && current.provider_enabled !== false
          ? current.allowed_tools
          : []
        : ['handoff_to_human'];
      const localContact = contact
        ? !!(
            await c.query(
              'SELECT 1 FROM contacts WHERE id=$1 AND merged_into_id IS NULL AND archived_at IS NULL FOR SHARE',
              [contact],
            )
          ).rowCount
        : false;
      let actions = 0,
        handoff = false;
      for (const [index, tool] of tools.entries()) {
        const inputHash = createHash('sha256')
          .update(JSON.stringify([contact ?? null, tool.input]))
          .digest('hex');
        const prior = (
          await c.query(
            'SELECT outcome,tool_name,input_hash FROM ai_tool_audits WHERE run_id=$1 AND tool_index=$2',
            [run, index],
          )
        ).rows[0];
        if (prior) {
          if (prior.input_hash !== inputHash || prior.tool_name !== tool.name.slice(0, 100))
            throw new Error('AI tool replay changed its input');
          if (prior.outcome === 'applied') {
            if (prior.tool_name === 'handoff_to_human') handoff = true;
            else actions++;
          }
          continue;
        }
        let outcome = 'denied',
          resource: string | null = null;
        await c.query('SAVEPOINT ai_tool');
        try {
          if (!allowed.includes(tool.name) || (tool.name === 'handoff_to_human' && !handoffEnabled))
            outcome = 'denied';
          else if (index >= 3) outcome = 'limit';
          else if (tool.name === 'handoff_to_human') {
            const parsed = z
              .object({ reason: z.string().trim().min(1).max(500) })
              .safeParse(tool.input);
            outcome = parsed.success ? 'applied' : 'invalid';
            if (parsed.success) handoff = true;
          } else if (!localContact) outcome = 'denied';
          else if (tool.name === 'create_followup') {
            const parsed = z
              .object({
                title: z.string().trim().min(1).max(200),
                dueHours: z.number().int().min(1).max(720),
              })
              .safeParse(tool.input);
            if (!parsed.success) outcome = 'invalid';
            else {
              resource = (
                await c.query(
                  'INSERT INTO crm_tasks(tenant_id,contact_id,title,due_at) VALUES($1,$2,$3,now()+make_interval(hours=>$4)) RETURNING id',
                  [tenant, contact, parsed.data.title, parsed.data.dueHours],
                )
              ).rows[0].id;
              outcome = 'applied';
              actions++;
            }
          } else if (tool.name === 'tag_contact') {
            const parsed = z
              .object({ tag: z.string().trim().min(1).max(50) })
              .safeParse(tool.input);
            if (!parsed.success) outcome = 'invalid';
            else {
              const changed = (
                await c.query(
                  'UPDATE contacts SET tags=array_append(tags,$2),updated_at=now() WHERE id=$1 AND NOT $2=ANY(tags)',
                  [contact, parsed.data.tag],
                )
              ).rowCount;
              outcome = changed ? 'applied' : 'noop';
              if (changed) actions++;
            }
          }
        } catch {
          await c.query('ROLLBACK TO SAVEPOINT ai_tool');
          outcome = 'failed';
        }
        await c.query(
          'INSERT INTO ai_tool_audits(tenant_id,run_id,agent_id,tool_index,tool_name,input_hash,outcome,resource_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [tenant, run, agent, index, tool.name.slice(0, 100), inputHash, outcome, resource],
        );
      }
      return { actions, handoff };
    });
  }
}
