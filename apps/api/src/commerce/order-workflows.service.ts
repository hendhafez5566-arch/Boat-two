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

export const orderWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(64),
  stages: z.array(stageSchema).min(1).max(12),
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
  history: { stage: number; action: string; actor: string; assignee: string | null; at: string }[];
}

@Injectable()
export class OrderWorkflowsService {
  constructor(private readonly db: DatabaseService) {}

  list(tenant: string) {
    return this.db.withTenant(tenant, async c => (await c.query(
      'SELECT id,name,stages FROM order_workflows WHERE tenant_id=$1 AND archived_at IS NULL ORDER BY name,id',
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
      const fields = [tenant, definition.name, JSON.stringify(definition.stages)];
      const result = id ? await c.query(
        'UPDATE order_workflows SET name=$2,stages=$3 WHERE tenant_id=$1 AND id=$4 AND archived_at IS NULL RETURNING id',
        [...fields, id],
      ) : await c.query('INSERT INTO order_workflows(tenant_id,name,stages) VALUES($1,$2,$3) RETURNING id', fields);
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

  state(tenant: string, orderId: string) {
    return this.db.withTenant(tenant, async c => ({ work: (await c.query(
      `SELECT t.id,t.order_workflow AS workflow,t.due_at,t.priority,t.assigned_to,u.full_name AS assignee_name,t.status
       FROM crm_tasks t LEFT JOIN users u ON u.id=t.assigned_to WHERE t.tenant_id=$1 AND t.workflow_order_id=$2`,
      [tenant, orderId],
    )).rows[0] ?? null }));
  }

  private async pick(c: PoolClient, tenant: string, stage: Stage, requested?: string) {
    const fixed = requested ?? (stage.method === 'manual' ? stage.userId : null);
    if (stage.method === 'manual' && !fixed) return null;
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

  run(tenant: string, actor: string, orderId: string, input: WorkflowAction, assignedActorOnly = false) {
    return this.db.withTenant(tenant, async c => {
      // Serialize allocation decisions across orders to keep the rotation fair under concurrency.
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,123))', [tenant]);
      const { rows: [order] } = await c.query(
        'SELECT contact_id,status FROM commerce_orders WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [tenant, orderId],
      );
      if (!order) throw new NotFoundException('Order unavailable');
      const { rows: [task] } = await c.query(
        'SELECT id,order_workflow,assigned_to FROM crm_tasks WHERE tenant_id=$1 AND workflow_order_id=$2 FOR UPDATE',
        [tenant, orderId],
      );
      let run: Run;
      if (input.action === 'start') {
        if (task?.order_workflow.definitionId === input.definitionId) return { id: task.id };
        if (task) throw new ConflictException('This order already has a workflow');
        if (['cancelled','completed'].includes(order.status)) throw new ConflictException('The order is closed');
        const { rows: [definition] } = await c.query(
          'SELECT name,stages FROM order_workflows WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL',
          [tenant, input.definitionId],
        );
        if (!definition) throw new NotFoundException('Workflow unavailable');
        run = { ...definition, definitionId: input.definitionId, stage: 0, revision: 0, finished: false, history: [] };
      } else {
        if (!task) throw new NotFoundException('Workflow unavailable');
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
      const assignee = run.finished ? task.assigned_to : await this.pick(c, tenant, stage, requested);
      if (requested && !assignee) throw new BadRequestException('Employee is unavailable or outside the stage department');
      run.revision++;
      run.history.push({ stage: run.stage, action: input.action, actor, assignee, at: new Date().toISOString() });
      const title = run.name + ' · ' + stage.name;
      const values = [tenant, orderId, order.contact_id, title, stage.minutes, assignee, stage.priority, JSON.stringify(run)];
      const { rows: [written] } = task ? await c.query(
        `UPDATE crm_tasks SET title=$4,due_at=CASE WHEN $10 THEN due_at ELSE now()+make_interval(mins=>$5) END,
         assigned_to=$6,priority=$7,order_workflow=$8,status=$9,updated_at=now()
         WHERE tenant_id=$1 AND workflow_order_id=$2 AND contact_id=$3 RETURNING id`,
        [...values, run.finished ? 'done' : 'open', input.action === 'reassign' || run.finished],
      ) : await c.query(
        `INSERT INTO crm_tasks(tenant_id,workflow_order_id,contact_id,title,due_at,assigned_to,priority,order_workflow)
         VALUES($1,$2,$3,$4,now()+make_interval(mins=>$5),$6,$7,$8) RETURNING id`, values,
      );
      if (assignee && !run.finished) await c.query(
        `INSERT INTO crm_notifications(tenant_id,user_id,kind,resource_type,resource_id,contact_id,title,priority,dedupe_key)
         VALUES($1,$2,'assigned','task',$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [tenant, assignee, written.id, order.contact_id, title, stage.priority === 'high' ? 'high' : 'normal', `workflow:${written.id}:${run.revision}`],
      );
      return written;
    });
  }
}
