import { freezeContactActivity } from './crm-activity-export';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  GoneException,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Query,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { DatabaseService } from '../database/database.service';
import { EventsService } from '../events/events.service';
import { CrmService } from './crm.service';
import { contactSchema, filtersSchema, contactWhere } from './schemas';
@Injectable()
export class CrmJobs {
  constructor(
    private db: DatabaseService,
    private events: EventsService,
    private crm: CrmService,
  ) {}
  @OnEvent('crm.job', { suppressErrors: false }) async process(event: {
    tenantId: string;
    jobId: string;
  }) {
    await this.db.withTenant(event.tenantId, async (c) => {
      const job = (
        await c.query(
          "SELECT * FROM crm_jobs WHERE id=$1 AND status IN ('pending','running') FOR UPDATE",
          [event.jobId],
        )
      ).rows[0];
      if (!job) return;
      let processed = job.processed,
        succeeded = job.succeeded;
      const errors = job.errors as unknown[],
        result = job.result as unknown[];
      if (job.kind === 'import') {
        for (const row of job.input.contacts.slice(processed, processed + 100)) {
          await c.query('SAVEPOINT import_row');
          try {
            await this.crm.save(event.tenantId, contactSchema.parse(row));
            succeeded++;
            await c.query('RELEASE SAVEPOINT import_row');
          } catch (e) {
            await c.query('ROLLBACK TO SAVEPOINT import_row');
            await c.query('RELEASE SAVEPOINT import_row');
            if (errors.length < 100)
              errors.push({
                row: processed + 1,
                error:
                  e instanceof BadRequestException
                    ? e.message
                    : 'Row rejected; check duplicate identity, field types and plan limits',
              });
          }
          processed++;
        }
      } else if (job.input.storage === 'ordinal_rows_v1') {
        // Rows were frozen by one INSERT SELECT. Worker progress never loads or copies the payload.
        const count = Number(
          (
            await c.query(
              'SELECT count(*) n FROM crm_export_rows WHERE job_id=$1 AND ordinal>$2 AND ordinal<=$3',
              [job.id, processed, processed + 250],
            )
          ).rows[0].n,
        );
        if (count !== Math.min(250, job.total - processed))
          throw new Error('Frozen export row coverage is incomplete');
        processed += count;
        succeeded += count;
      } else {
        // Snapshot IDs at creation: do not skip/repeat rows when the contact list changes.
        const snapshots = job.input.snapshots;
        const ids = (job.input.ids ?? []).slice(processed, processed + 250);
        if (Array.isArray(snapshots)) {
          const rows = snapshots.slice(processed, processed + 250);
          result.push(...rows);
          succeeded += rows.length;
          processed += rows.length;
        } else if (ids.length) {
          const rows = (
            await c.query(
              'SELECT id,name,email,phone,lifecycle,tags,attributes,owner_id,archived_at FROM contacts WHERE id=ANY($1::uuid[]) ORDER BY id',
              [ids],
            )
          ).rows;
          result.push(...rows);
          succeeded += rows.length;
          processed += ids.length;
        }
      }
      const done = processed >= job.total;
      await c.query(
        'UPDATE crm_jobs SET status=$2,processed=$3,succeeded=$4,errors=$5,result=$6,updated_at=now() WHERE id=$1',
        [
          job.id,
          done ? 'completed' : 'running',
          processed,
          succeeded,
          JSON.stringify(errors),
          JSON.stringify(result),
        ],
      );
      if (!done)
        await this.events.publish(
          event.tenantId,
          'crm.job',
          job.id,
          { jobId: job.id },
          `crm-job:${job.id}:${processed}`,
        );
    });
  }
}
@Controller('crm/jobs')
@Roles('owner', 'admin')
export class CrmJobsController {
  constructor(
    private db: DatabaseService,
    private events: EventsService,
  ) {}
  @Get() list(@Req() r: AuthedRequest) {
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            "SELECT id,kind,status,processed,total,succeeded,errors,created_at,updated_at,expired_at,input->>'snapshotAt' AS snapshot_at FROM crm_jobs ORDER BY created_at DESC LIMIT 100",
          )
        ).rows,
    );
  }
  @Get('history') history(@Req() r: AuthedRequest) {
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            `SELECT COALESCE((SELECT available_from FROM crm_history_bounds),(SELECT greatest(created_at,(SELECT started_at FROM crm_history_epoch)) FROM tenants)) AS available_from,
       (SELECT max(recorded_at) FROM crm_contact_history) AS latest_recorded_at,
       (SELECT count(*)::int FROM crm_contact_changes) AS pending_changes`,
          )
        ).rows[0],
    );
  }
  @Post() async create(@Req() r: AuthedRequest, @Body() body: unknown) {
    const input = parse(
      z.discriminatedUnion('kind', [
        z.object({
          kind: z.literal('activity_export'),
          contactId: z.string().uuid(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        }),
        z.object({ kind: z.literal('import'), contacts: z.array(contactSchema).min(1).max(10000) }),
        z.object({
          kind: z.literal('export'),
          filters: filtersSchema.default({}),
          asOf: z.string().datetime().optional(),
        }),
      ]),
      body,
    );
    return this.db.withTenant(r.user.tenantId, async (c) => {
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      if (
        Number(
          (
            await c.query(
              "SELECT count(*) AS n FROM crm_jobs WHERE status IN ('pending','running')",
            )
          ).rows[0].n,
        ) >= 3
      )
        throw new BadRequestException('At most three active CRM jobs per workspace');
      if (input.kind === 'activity_export') {
        const job = await freezeContactActivity(
          c,
          r.user.tenantId,
          r.user.userId,
          input.contactId,
          input.from,
          input.to,
        );
        await this.events.publish(
          r.user.tenantId,
          'crm.job',
          job.id,
          { jobId: job.id },
          `crm-job:${job.id}:0`,
        );
        return job;
      }
      const data: unknown = input;
      let total = input.kind === 'import' ? input.contacts.length : 0;
      if (input.kind === 'export') {
        const where = contactWhere(input.filters);
        if (input.asOf) {
          if (new Date(input.asOf).getTime() > Date.now())
            throw new BadRequestException('Historical time cannot be in the future');
          const coverage = await this.history(r);
          if (
            !(
              await c.query(
                `SELECT $1::timestamptz>=COALESCE((SELECT available_from FROM crm_history_bounds),(SELECT greatest(created_at,(SELECT started_at FROM crm_history_epoch)) FROM tenants)) AS covered`,
                [input.asOf],
              )
            ).rows[0].covered
          )
            throw new BadRequestException('Time precedes retained CRM history');
          if (coverage.pending_changes)
            throw new BadRequestException('CRM history is catching up; refresh and retry');
        }
        // Create only metadata, then freeze in PostgreSQL without materializing all profiles in Node.
        const job = (
          await c.query(
            "INSERT INTO crm_jobs(tenant_id,kind,input,total,created_by) VALUES($1,'export',$2,0,$3) RETURNING id,kind,status,total",
            [
              r.user.tenantId,
              JSON.stringify({
                storage: 'ordinal_rows_v1',
                historySemantics: input.asOf
                  ? 'committed_changes_observed_by_journal'
                  : 'request_time_statement_snapshot',
              }),
              r.user.userId,
            ],
          )
        ).rows[0];
        const source = input.asOf
          ? `WITH latest AS (SELECT DISTINCT ON(contact_id) snapshot,deleted FROM crm_contact_history WHERE recorded_at<=$5 ORDER BY contact_id,recorded_at DESC,change_id DESC),
             profiles AS (SELECT (jsonb_populate_record(NULL::contacts,snapshot)).* FROM latest WHERE NOT deleted)
             SELECT id,name,email,phone,lifecycle,tags,attributes,owner_id,archived_at FROM profiles WHERE ${where.sql} ORDER BY id LIMIT 50001`
          : `SELECT id,name,email,phone,lifecycle,tags,attributes,owner_id,archived_at FROM contacts WHERE ${where.sql} ORDER BY id LIMIT 50001`;
        const params = [...where.params, ...(input.asOf ? [input.asOf] : [])];
        const jobIndex = params.length + 1;
        const frozen = await c.query(
          `WITH stamp AS (UPDATE crm_jobs SET input=input||jsonb_build_object('snapshotAt',${input.asOf ? '$5::timestamptz' : 'statement_timestamp()'}) WHERE id=$${jobIndex} RETURNING tenant_id,id),
           source AS (${source})
           INSERT INTO crm_export_rows(tenant_id,job_id,ordinal,payload)
           SELECT stamp.tenant_id,stamp.id,row_number() OVER(ORDER BY source.id),to_jsonb(source) FROM source CROSS JOIN stamp`,
          [...params, job.id],
        );
        total = frozen.rowCount ?? 0;
        if (total > 50000)
          throw new BadRequestException('Narrow the export to at most 50,000 contacts');
        await c.query('UPDATE crm_jobs SET total=$2 WHERE id=$1', [job.id, total]);
        await this.events.publish(
          r.user.tenantId,
          'crm.job',
          job.id,
          { jobId: job.id },
          `crm-job:${job.id}:0`,
        );
        return { ...job, total };
      }
      const row = (
        await c.query(
          'INSERT INTO crm_jobs(tenant_id,kind,input,total,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,kind,status,total',
          [r.user.tenantId, input.kind, JSON.stringify(data), total, r.user.userId],
        )
      ).rows[0];
      await this.events.publish(
        r.user.tenantId,
        'crm.job',
        row.id,
        { jobId: row.id },
        `crm-job:${row.id}:0`,
      );
      return row;
    });
  }
  @Get(':id/result') result(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown = {},
  ) {
    const q = parse(
      z
        .object({
          after: z.coerce.number().int().min(0).max(50000).optional(),
          limit: z.coerce.number().int().min(1).max(1000).optional(),
        })
        .strict(),
      query,
    );
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const row = (
        await c.query(
          "SELECT errors,processed,succeeded,expired_at,CASE WHEN input->>'storage'='ordinal_rows_v1' THEN total ELSE jsonb_array_length(result) END AS total,input->>'storage' AS storage,input->>'snapshotAt' AS snapshot_at,input->>'historySemantics' AS history_semantics,input->'historyCoverage' AS history_coverage,input->>'contactId' AS contact_id,input->>'from' AS from_at,input->>'to' AS to_at FROM crm_jobs WHERE id=$1 AND status='completed'",
          [id],
        )
      ).rows[0];
      if (!row) throw new NotFoundException('Completed job not found');
      if (row.expired_at) throw new GoneException('Job payload expired under workspace retention');
      const paged = q.after !== undefined || q.limit !== undefined,
        after = q.after ?? 0,
        limit = paged ? (q.limit ?? 250) : 50000;
      const items =
        row.storage === 'ordinal_rows_v1'
          ? (
              await c.query(
                'SELECT payload FROM crm_export_rows WHERE job_id=$1 AND ordinal>$2 ORDER BY ordinal LIMIT $3',
                [id, after, limit],
              )
            ).rows.map((r) => r.payload)
          : (
              await c.query(
                'SELECT item FROM crm_jobs j CROSS JOIN LATERAL jsonb_array_elements(j.result) WITH ORDINALITY AS r(item,ordinal) WHERE j.id=$1 AND ordinal>$2 ORDER BY ordinal LIMIT $3',
                [id, after, limit],
              )
            ).rows.map((r) => r.item);
      return {
        ...row,
        result: items,
        ...(paged
          ? { nextAfter: after + items.length < row.total ? after + items.length : null }
          : {}),
      };
    });
  }
  @Patch(':id/cancel') cancel(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(r.user.tenantId, async (c) => {
      if (
        !(
          await c.query(
            "UPDATE crm_jobs SET status='canceled',updated_at=now() WHERE id=$1 AND status IN ('pending','running')",
            [id],
          )
        ).rowCount
      )
        throw new BadRequestException('Job cannot be canceled');
      return { canceled: true };
    });
  }
}
