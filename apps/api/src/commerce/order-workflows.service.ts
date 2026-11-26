import { OnEvent } from '@nestjs/event-emitter';
import type { DomainEvent } from '../events/events.service';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';

const stageSchema = z.object({
  name: z.string().trim().min(1).max(64),
  userId: z.string().uuid().nullable(),
  departmentId: z.string().uuid().nullable(),
  method: z.enum(['manual', 'rotation', 'least_busy']),
  minutes: z.number().int().min(1).max(43200),
  priority: z.enum(['low', 'normal', 'high']),
  autoAdvance: z.boolean().default(false),
}).refine(stage => stage.method === 'manual' || !!stage.departmentId);

export const workflowSource = z.enum(['order', 'conversation', 'contact', 'task']);
export type WorkflowSource = z.infer<typeof workflowSource>;
const sourceConfig = {
  order: { table: 'commerce_orders', key: 'workflow_order_id', select: 'contact_id,status' },
  conversation: { table: 'conversations', key: 'workflow_conversation_id', select: 'contact_id,status' },
  contact: { table: 'contacts', key: 'workflow_contact_id', select: 'id AS contact_id, lifecycle AS status' },
  task: { table: 'crm_tasks', key: 'id', select: 'contact_id,status' },
} as const;

export const orderWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(64),
  stages: z.array(stageSchema).min(1).max(12),
  source: workflowSource.optional(),
  start_condition: z.enum(['manual','created','unassigned']).optional(),
});
type Definition = z.infer<typeof orderWorkflowSchema>;
type Stage = z.infer<typeof stageSchema>;
export type WorkflowAction =
  | { action: 'start'; definitionId: string }
  | { action: 'advance' | 'reassign'; revision: number; userId?: string };

interface Run extends Definition {
  definitionId: string;
  stage: number;
  revision: number;
  finished: boolean;
  history: { stage: number; action: string; actor: string | null; assignee: string | null; at: string }[];
}

@Injectable()
export class OrderWorkflowsService {
  constructor(private readonly db: DatabaseService) {}

  list(tenant: string) {
    return this.db.withTenant(tenant, async c => (await c.query(
      'SELECT id,name,stages,source,start_condition FROM order_workflows WHERE tenant_id=$1 AND archived_at IS NULL ORDER BY name,id',
      [tenant],
    )).rows);
  }

  save(tenant: string, definition: Definition, id?: string) {
    return this.db.withTenant(tenant, async c => {
      for (const stage of definition.stages) {
        if (stage.departmentId && !(await c.query(
          'SELECT 1 FROM departments WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL',
          [tenant, stage.departmentId],
        )).rowCount) throw new BadRequestException('Department unavailable');
        if (stage.userId && !(await this.pick(c, tenant, stage, stage.userId)))
          throw new BadRequestException('Choose a currently available employee in the selected department');
      }
      const fields = [tenant, definition.name, JSON.stringify(definition.stages), definition.source ?? 'order', definition.start_condition ?? 'manual'];
      const result = id ? await c.query(
        'UPDATE order_workflows SET name=$2,stages=$3,source=$4,start_condition=$5 WHERE tenant_id=$1 AND id=$6 AND archived_at IS NULL RETURNING id',
        [...fields, id],
      ) : await c.query('INSERT INTO order_workflows(tenant_id,name,stages,source,start_condition) VALUES($1,$2,$3,$4,$5) RETURNING id', fields);
      if (!result.rowCount) throw new NotFoundException('Workflow unavailable');
      return result.rows[0];
    });
  }

  archive(tenant: string, id: string) {
    return this.db.withTenant(tenant, async c => {
      const updated = await c.query(
        'UPDATE order_workflows SET archived_at=now() WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL',
        [tenant, id],
      );
      if (!updated.rowCount) throw new NotFoundException('Workflow unavailable');
      return { archived: true };
    });
  }

  items(tenant: string, source: WorkflowSource, search = '') {
    const { table, key } = sourceConfig[source];
    const target = source === 'contact' ? 'r.id' : 'r.contact_id';
    const names = {
      order: "concat(ct.name,' · ',r.snapshot->>'name')",
      task: 'r.title',
      conversation: 'ct.name',
      contact: 'ct.name',
    };
    const match = search.replace(/[\\%_]/g, '\\$&');
    return this.db.withTenant(tenant, async c => (await c.query(
      `SELECT r.id,${names[source]} AS name,t.order_workflow->>'name' AS workflow,
              t.due_at,t.status AS task_status
       FROM ${table} r JOIN contacts ct ON ct.tenant_id=r.tenant_id AND ct.id=${target}
       LEFT JOIN crm_tasks t ON t.tenant_id=r.tenant_id AND t.${key}=r.id AND t.order_workflow IS NOT NULL
       WHERE r.tenant_id=$1 AND ct.archived_at IS NULL AND ct.merged_into_id IS NULL
          AND (${names[source]} ILIKE $2 OR r.id::text=$3)
          ${source === 'task' ? 'AND (r.order_workflow IS NULL OR NOT (r.workflow_order_id IS NOT NULL OR r.workflow_conversation_id IS NOT NULL OR r.workflow_contact_id IS NOT NULL))' : ''}
          ${source === 'conversation' ? 'AND r.archived_at IS NULL' : ''}
       ORDER BY (t.status='open' AND t.due_at<=now()) DESC NULLS LAST, r.created_at DESC,r.id LIMIT 50`,
      [tenant, '%' + match + '%', search],
    )).rows);
  }

  state(tenant: string, orderId: string, source: WorkflowSource = 'order') {
    const key = sourceConfig[source].key;
    return this.db.withTenant(tenant, async c => ({ work: (await c.query(
      `SELECT t.id,t.order_workflow AS workflow,t.due_at,t.priority,t.assigned_to,u.full_name AS assignee_name,t.status
       FROM crm_tasks t LEFT JOIN users u ON u.id=t.assigned_to WHERE t.tenant_id=$1 AND t.${key}=$2 AND t.order_workflow IS NOT NULL`,
      [tenant, orderId],
    )).rows[0] ?? null }));
  }

  private async pick(c: PoolClient, tenant: string, stage: Stage, requested?: string, recover = false) {
    const fixed = requested ?? (stage.method === 'manual' && !recover ? stage.userId : null);
    if (stage.method === 'manual' && !fixed && !recover) return null;
    const { rows: [candidate] } = await c.query(
      `SELECT m.user_id
         FROM memberships m JOIN users u ON u.id=m.user_id
         WHERE m.tenant_id=$1 AND u.disabled_at IS NULL AND m.available
           AND ($2::uuid IS NULL OR m.user_id=$2)
           AND ($3::uuid IS NULL OR EXISTS(
             SELECT 1 FROM department_members dm JOIN departments d ON d.id=dm.department_id
             WHERE dm.tenant_id=$1 AND dm.department_id=$3 AND dm.user_id=m.user_id AND d.archived_at IS NULL))
         ORDER BY
           CASE WHEN $4='least_busy' THEN
             (SELECT count(*) FROM crm_tasks t WHERE t.tenant_id=$1 AND t.assigned_to=m.user_id AND t.status='open')
             + (SELECT count(*) FROM conversations cv WHERE cv.tenant_id=$1 AND cv.assigned_to=m.user_id AND cv.status<>'closed' AND cv.archived_at IS NULL)
           END,
           (SELECT max((entry->>'at')::timestamptz) FROM crm_tasks t
            CROSS JOIN LATERAL jsonb_array_elements(t.order_workflow->'history') entry
            WHERE t.tenant_id=$1 AND entry->>'assignee'=m.user_id::text) ASC NULLS FIRST,
           m.user_id
         LIMIT 1 FOR SHARE OF m,u`,
      [tenant, fixed, stage.departmentId, stage.method],
    );
    return (candidate?.user_id as string | undefined) ?? null;
  }

  @OnEvent('domain.event', { suppressErrors: false })
  async handle(event: DomainEvent) {
    if (event.type === 'workflow.source.created') {
      const data = z.object({ source: workflowSource, id: z.string().uuid(), definitionId: z.string().uuid() }).parse(event.payload);
      try {
        await this.run(event.tenantId, null, data.id, { action: 'start', definitionId: data.definitionId }, false, data.source);
      } catch (error) {
        if (!(error instanceof NotFoundException || error instanceof ConflictException)) throw error;
      }
    }
    if (event.type === 'workflow.maintenance') {
      const data = z.object({ id: z.string().uuid() }).parse(event.payload);
      await this.maintain(event.tenantId, data.id);
    }
  }

  run(tenant: string, actor: string | null, orderId: string, input: WorkflowAction, assignedActorOnly = false, source: WorkflowSource = 'order', recover = false) {
    const { table, key, select } = sourceConfig[source];
    return this.db.withTenant(tenant, async c => {
      // Serialize allocation decisions across orders to keep the rotation fair under concurrency.
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,123))', [tenant]);
      const { rows: [order] } = await c.query(
        `SELECT ${select} FROM ${table} WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
        [tenant, orderId],
      );
      if (!order) throw new NotFoundException('Order unavailable');
      const { rows: [task] } = await c.query(
        `SELECT id,order_workflow,assigned_to FROM crm_tasks WHERE tenant_id=$1 AND ${key}=$2 FOR UPDATE`,
        [tenant, orderId],
      );
      let run: Run;
      if (input.action === 'start') {
        if (task?.order_workflow?.definitionId === input.definitionId) return { id: task.id };
        if (task?.order_workflow) throw new ConflictException('This work already has a workflow');
        if (['cancelled','completed','closed','done'].includes(order.status)) throw new ConflictException('The order is closed');
        const { rows: [definition] } = await c.query(
          'SELECT name,stages,source FROM order_workflows WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL AND source=$3',
          [tenant, input.definitionId, source],
        );
        if (!definition) throw new NotFoundException('Workflow unavailable');
        run = { ...definition, definitionId: input.definitionId, stage: 0, revision: 0, finished: false, history: [] };
      } else {
        if (!task?.order_workflow) throw new NotFoundException('Workflow unavailable');
        if (assignedActorOnly && task.assigned_to !== actor) throw new ForbiddenException('Only the assigned employee may complete this stage');
        run = task.order_workflow;
        if (run.revision !== input.revision || run.finished) throw new ConflictException('Workflow changed; refresh before continuing');
        if (input.action === 'advance') {
          if (run.stage + 1 === run.stages.length) run.finished = true;
          else run.stage++;
        }
      }
      const stage = run.stages[run.stage];
      const requested = input.action === 'reassign' ? input.userId : undefined;
      const assignee = run.finished ? task.assigned_to : await this.pick(c, tenant, stage, requested, recover);
      if (recover && assignee === task.assigned_to) return { id: task.id };
      if (requested && !assignee) throw new BadRequestException('Employee is unavailable or outside the stage department');
      run.revision++;
      run.history.push({ stage: run.stage, action: input.action, actor, assignee, at: new Date().toISOString() });
      const title = run.name + ' · ' + stage.name;
      const values = [tenant, orderId, order.contact_id, title, stage.minutes, assignee, stage.priority, JSON.stringify(run)];
      const { rows: [written] } = task ? await c.query(
        `UPDATE crm_tasks SET title=$4,due_at=CASE WHEN $10 THEN due_at ELSE now()+make_interval(mins=>$5) END,
         assigned_to=$6,priority=$7,order_workflow=$8,status=$9,updated_at=now()
         WHERE tenant_id=$1 AND ${key}=$2 AND contact_id=$3 RETURNING id`,
        [...values, run.finished ? 'done' : 'open', input.action === 'reassign' || run.finished],
      ) : await c.query(
        `INSERT INTO crm_tasks(tenant_id,${key},contact_id,title,due_at,assigned_to,priority,order_workflow)
         VALUES($1,$2,$3,$4,now()+make_interval(mins=>$5),$6,$7,$8) RETURNING id`, values,
      );
      if (assignee && !run.finished && source === 'conversation')
        await c.query('UPDATE conversations SET assigned_to=$3 WHERE tenant_id=$1 AND id=$2', [tenant, orderId, assignee]);
      if (assignee && !run.finished && source === 'contact')
        await c.query('UPDATE contacts SET owner_id=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2', [tenant, orderId, assignee]);
      if (assignee && !run.finished) await c.query(
        `INSERT INTO crm_notifications(tenant_id,user_id,kind,resource_type,resource_id,contact_id,title,priority,dedupe_key)
         VALUES($1,$2,'assigned','task',$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [tenant, assignee, written.id, order.contact_id, title, stage.priority === 'high' ? 'high' : 'normal', `workflow:${written.id}:${run.revision}`],
      );
      return written;
    });
  }
  private maintain(tenant: string, id: string) {
    return this.db.withTenant(tenant, async c => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,123))', [tenant]);
      const { rows: [task] } = await c.query(
        `SELECT t.*,t.due_at<=now() AS overdue,t.due_at<=now()-interval '30 minutes' AS escalate,
                NOT(coalesce(m.available,false) AND u.disabled_at IS NULL) AS needs_assignment
         FROM crm_tasks t LEFT JOIN memberships m ON m.tenant_id=t.tenant_id AND m.user_id=t.assigned_to
         LEFT JOIN users u ON u.id=m.user_id
         WHERE t.tenant_id=$1 AND t.id=$2 AND t.status='open' AND t.order_workflow IS NOT NULL`,
        [tenant, id],
      );
      if (!task || task.order_workflow.finished) return;
      const source: WorkflowSource = task.order_workflow.source ?? 'order';
      const { key } = sourceConfig[source];
      const stage = task.order_workflow.stages[task.order_workflow.stage] as Stage;
      if (task.needs_assignment && (stage.departmentId || stage.method !== 'manual')) {
        await this.run(tenant, null, task[key], { action: 'reassign', revision: task.order_workflow.revision }, false, source, true);
      }
      if (task.overdue) await c.query(
        `INSERT INTO crm_notifications(tenant_id,user_id,kind,resource_type,resource_id,contact_id,title,priority,dedupe_key)
         SELECT t.tenant_id,m.user_id,CASE WHEN m.user_id=t.assigned_to THEN 'task_overdue' ELSE 'workflow_escalated' END,
           'task',t.id,t.contact_id,t.title,'high',
           'workflow-overdue:'||t.id||':'||(t.order_workflow->>'stage')||':'||extract(epoch FROM t.due_at)
         FROM crm_tasks t JOIN memberships m ON m.tenant_id=t.tenant_id
         JOIN users u ON u.id=m.user_id AND u.disabled_at IS NULL
         WHERE t.tenant_id=$1 AND t.id=$2 AND
           (m.user_id=t.assigned_to OR ($3 AND m.role IN ('owner','admin'))) ON CONFLICT DO NOTHING`,
        [tenant, id, task.escalate],
      );
    });
  }

}
