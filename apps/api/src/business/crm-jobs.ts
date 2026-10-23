import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
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
      } else {
        // Snapshot IDs at creation: do not skip/repeat rows when the contact list changes.
        const ids = job.input.ids.slice(processed, processed + 250);
        if (ids.length) {
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
            'SELECT id,kind,status,processed,total,succeeded,errors,created_at,updated_at FROM crm_jobs ORDER BY created_at DESC LIMIT 100',
          )
        ).rows,
    );
  }
  @Post() async create(@Req() r: AuthedRequest, @Body() body: unknown) {
    const input = parse(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('import'), contacts: z.array(contactSchema).min(1).max(10000) }),
        z.object({ kind: z.literal('export'), filters: filtersSchema.default({}) }),
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
      let data: unknown = input,
        total = input.kind === 'import' ? input.contacts.length : 0;
      if (input.kind === 'export') {
        const where = contactWhere(input.filters);
        const rows = (
          await c.query(
            `SELECT id FROM contacts WHERE ${where.sql} ORDER BY id LIMIT 50001`,
            where.params,
          )
        ).rows;
        if (rows.length > 50000)
          throw new BadRequestException('Narrow the export to at most 50,000 contacts');
        data = { ids: rows.map((row) => row.id) };
        total = rows.length;
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
  @Get(':id/result') result(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const row = (
        await c.query(
          "SELECT result,errors,processed,succeeded FROM crm_jobs WHERE id=$1 AND status='completed'",
          [id],
        )
      ).rows[0];
      if (!row) throw new NotFoundException('Completed job not found');
      return row;
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
