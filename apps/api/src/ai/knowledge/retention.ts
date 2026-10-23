import { BadRequestException, Body, Controller, Get, Injectable, Post, Req } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { z } from 'zod';
import { Roles } from '../../auth/decorators';
import { AuthedRequest } from '../../common/types';
import { parse } from '../../common/zod';
import { DatabaseService } from '../../database/database.service';
import { EventsService } from '../../events/events.service';
const schema = z.object({ days: z.number().int().min(30).max(3650) });
const jobsPredicate =
  "status IN ('completed','canceled') AND updated_at<$1 AND payload_purged_at IS NULL";
const snapshotsPredicate =
  "e.created_at<$1 AND e.purged_at IS NULL AND j.status IN ('completed','canceled') AND EXISTS(SELECT 1 FROM knowledge_extractions newer WHERE newer.source_id=e.source_id AND (newer.created_at,newer.id)>(e.created_at,e.id))";
@Injectable()
export class KnowledgeRetention {
  constructor(
    private db: DatabaseService,
    private events: EventsService,
  ) {}
  preview(tenant: string, days: number) {
    return this.db.withTenant(tenant, async (c) => {
      const cutoff = new Date(Date.now() - days * 86400000);
      return {
        cutoff,
        jobs: (
          await c.query('SELECT count(*)::int n FROM knowledge_jobs WHERE ' + jobsPredicate, [
            cutoff,
          ])
        ).rows[0].n,
        extractions: (
          await c.query(
            'SELECT count(*)::int n FROM knowledge_extractions e JOIN knowledge_jobs j ON j.id=e.job_id WHERE ' +
              snapshotsPredicate,
            [cutoff],
          )
        ).rows[0].n,
      };
    });
  }
  create(tenant: string, actor: string, days: number) {
    return this.db.withTenant(tenant, async (c) => {
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      if ((await c.query("SELECT 1 FROM knowledge_retention_runs WHERE status='pending'")).rowCount)
        throw new BadRequestException('Retention already pending');
      const row = (
        await c.query(
          'INSERT INTO knowledge_retention_runs(tenant_id,requested_by,cutoff) VALUES($1,$2,$3) RETURNING id,status',
          [tenant, actor, new Date(Date.now() - days * 86400000)],
        )
      ).rows[0];
      await this.events.publish(tenant, 'knowledge.retention', row.id, { id: row.id });
      return row;
    });
  }
  @OnEvent('knowledge.retention', { suppressErrors: false }) async process(event: {
    tenantId: string;
    id: string;
  }) {
    return this.db.withTenant(event.tenantId, async (c) => {
      const run = (
        await c.query(
          "SELECT * FROM knowledge_retention_runs WHERE id=$1 AND status='pending' FOR UPDATE",
          [event.id],
        )
      ).rows[0];
      if (!run) return;
      if (
        !(
          await c.query(
            "SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=$1 AND m.role='owner' AND u.disabled_at IS NULL AND t.suspended_at IS NULL",
            [run.requested_by],
          )
        ).rowCount
      ) {
        await c.query(
          "UPDATE knowledge_retention_runs SET status='failed',error='Requesting owner is no longer authorized',updated_at=now() WHERE id=$1",
          [run.id],
        );
        return;
      }
      const jobs = (
        await c.query(
          'SELECT id,source_id FROM knowledge_jobs WHERE ' +
            jobsPredicate +
            ' ORDER BY updated_at,id LIMIT 100',
          [run.cutoff],
        )
      ).rows;
      let purged = 0,
        extractions = 0;
      for (const job of jobs) {
        if (
          !(
            await c.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,41)) ok', [
              job.source_id,
            ])
          ).rows[0].ok
        )
          continue;
        purged +=
          (
            await c.query(
              "UPDATE knowledge_jobs SET raw_file=NULL,chunks='[]',prepared='[]',payload_purged_at=now() WHERE id=$2 AND " +
                jobsPredicate,
              [run.cutoff, job.id],
            )
          ).rowCount ?? 0;
      }
      const snapshots = (
        await c.query(
          'SELECT e.id,e.source_id FROM knowledge_extractions e JOIN knowledge_jobs j ON j.id=e.job_id WHERE ' +
            snapshotsPredicate +
            ' ORDER BY e.created_at,e.id LIMIT 100',
          [run.cutoff],
        )
      ).rows;
      for (const row of snapshots) {
        if (
          !(
            await c.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,41)) ok', [
              row.source_id,
            ])
          ).rows[0].ok
        )
          continue;
        extractions +=
          (
            await c.query(
              'UPDATE knowledge_extractions SET content=NULL,purged_at=now() WHERE id=$1 AND purged_at IS NULL',
              [row.id],
            )
          ).rowCount ?? 0;
      }
      const moreJobs = (
        await c.query('SELECT 1 FROM knowledge_jobs WHERE ' + jobsPredicate + ' LIMIT 1', [
          run.cutoff,
        ])
      ).rowCount;
      const moreSnapshots = (
        await c.query(
          'SELECT 1 FROM knowledge_extractions e JOIN knowledge_jobs j ON j.id=e.job_id WHERE ' +
            snapshotsPredicate +
            ' LIMIT 1',
          [run.cutoff],
        )
      ).rowCount;
      await c.query(
        'UPDATE knowledge_retention_runs SET jobs_purged=jobs_purged+$2,extractions_purged=extractions_purged+$3,status=$4,updated_at=now() WHERE id=$1',
        [run.id, purged, extractions, moreJobs || moreSnapshots ? 'pending' : 'completed'],
      );
      if (moreJobs || moreSnapshots)
        await this.events.publish(
          event.tenantId,
          'knowledge.retention',
          run.id,
          { id: run.id },
          undefined,
          new Date(Date.now() + 1000).toISOString(),
        );
    });
  }
}
@Controller('ai/knowledge-retention')
@Roles('owner')
export class KnowledgeRetentionController {
  constructor(
    private db: DatabaseService,
    private retention: KnowledgeRetention,
  ) {}
  @Get() list(@Req() r: AuthedRequest) {
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (await c.query('SELECT * FROM knowledge_retention_runs ORDER BY created_at DESC LIMIT 30'))
          .rows,
    );
  }
  @Post('preview') preview(@Req() r: AuthedRequest, @Body() input: unknown) {
    return this.retention.preview(r.user.tenantId, parse(schema, input).days);
  }
  @Post() create(@Req() r: AuthedRequest, @Body() input: unknown) {
    const b = parse(schema.extend({ confirmed: z.literal(true) }), input);
    return this.retention.create(r.user.tenantId, r.user.userId, b.days);
  }
}
