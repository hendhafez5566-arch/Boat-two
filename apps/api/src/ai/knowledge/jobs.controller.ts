import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Roles } from '../../auth/decorators';
import { AuthedRequest } from '../../common/types';
import { parse } from '../../common/zod';
import { DatabaseService } from '../../database/database.service';
import { EventsService } from '../../events/events.service';
import { PlansService } from '../../plans/plans.service';
@Controller('ai/knowledge-jobs')
@Roles('owner', 'admin')
export class KnowledgeJobsController {
  constructor(
    private db: DatabaseService,
    private events: EventsService,
    private plans: PlansService,
  ) {}
  @Get() list(@Req() r: AuthedRequest) {
    return this.db.withTenant(r.user.tenantId, async (c) => ({
      jobs: (
        await c.query(
          'SELECT j.id,j.source_id,s.title,j.status,j.processed,j.total,j.error,j.attempts,j.updated_at FROM knowledge_jobs j JOIN knowledge_sources s ON s.id=j.source_id ORDER BY j.created_at DESC LIMIT 100',
        )
      ).rows,
      usage: (
        await c.query(
          "SELECT charged,reserved,period FROM embedding_usage WHERE period=date_trunc('month',now())::date",
        )
      ).rows[0] ?? { charged: 0, reserved: 0 },
      limit: (await this.plans.getTenantPlan(c)).limits.embedding_token_budget ?? 0,
      reservations: (
        await c.query(
          "SELECT effect_key,amount,status,created_at FROM embedding_reservations WHERE status IN ('reserved','uncertain') ORDER BY created_at DESC LIMIT 100",
        )
      ).rows,
    }));
  }
  @Post(':id/resume') resume(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const row = (
        await c.query(
          "UPDATE knowledge_jobs SET status='pending',error=NULL,updated_at=now() WHERE id=$1 AND status IN ('blocked','failed') RETURNING source_id",
          [id],
        )
      ).rows[0];
      if (!row) throw new BadRequestException('Job is not resumable');
      await c.query("UPDATE knowledge_sources SET status='pending',error=NULL WHERE id=$1", [
        row.source_id,
      ]);
      await this.events.publish(r.user.tenantId, 'knowledge.job', id, { jobId: id }, randomUUID());
      return { queued: true };
    });
  }
  @Post(':id/cancel') cancel(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const job = (
        await c.query(
          "UPDATE knowledge_jobs SET status='canceled',updated_at=now() WHERE id=$1 AND status IN ('pending','running','blocked','failed') RETURNING source_id",
          [id],
        )
      ).rows[0];
      if (!job) throw new NotFoundException();
      await c.query(
        "UPDATE knowledge_sources SET status=CASE WHEN chunk_count>0 THEN 'ready' ELSE 'canceled' END,error='Indexing job canceled',updated_at=now() WHERE id=$1",
        [job.source_id],
      );
      return { canceled: true };
    });
  }
  @Post('reservations/reconcile') reconcile(@Req() r: AuthedRequest, @Body() body: unknown) {
    const b = parse(
      z.object({
        key: z.string().min(1).max(200),
        result: z.enum(['charged', 'not_executed']),
        evidence: z.string().trim().min(20).max(1000),
      }),
      body,
    );
    return this.db.detached(r.user.tenantId, async (c) => {
      const reservation = (
        await c.query(
          "SELECT * FROM embedding_reservations WHERE effect_key=$1 AND (status='uncertain' OR status='reserved' AND created_at<now()-interval '10 minutes') FOR UPDATE",
          [b.key],
        )
      ).rows[0];
      if (!reservation) throw new NotFoundException();
      // Reconciliation changes accounting only; ambiguous effects are not reset or replayed.
      await c.query(
        'UPDATE embedding_usage SET reserved=reserved-$2,charged=charged+$3 WHERE period=$1',
        [reservation.period, reservation.amount, b.result === 'charged' ? reservation.amount : 0],
      );
      await c.query('UPDATE embedding_reservations SET status=$2 WHERE effect_key=$1', [
        b.key,
        b.result === 'charged' ? 'charged' : 'released',
      ]);
      await c.query(
        "INSERT INTO audit_logs(tenant_id,actor_id,action,resource_type,resource_id,details) VALUES($1,$2,'reconcile','embedding_reservation',$3,$4)",
        [
          r.user.tenantId,
          r.user.userId,
          b.key,
          JSON.stringify({ result: b.result, evidence: b.evidence }),
        ],
      );
      return { reconciled: true, automaticReplay: false };
    });
  }
}
