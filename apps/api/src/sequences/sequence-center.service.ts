import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { computeNextRun } from './schedule';
import { SequenceStep } from './sequences.schemas';
import {
  SequenceAudience,
  sequenceAudienceSchema,
  sequenceAudienceWhere,
  sequenceCenterQuery,
} from './sequence-audience';
@Injectable()
export class SequenceCenterService {
  constructor(private db: DatabaseService) {}
  list(tenant: string, input: z.infer<typeof sequenceCenterQuery>) {
    return this.db.withTenant(tenant, async (c) => {
      const params: unknown[] = [];
      const where = ['true'];
      if (input.channelId) {
        params.push(input.channelId);
        where.push(`s.channel_id=$${params.length}`);
      }
      if (input.status !== 'all') {
        params.push(input.status);
        where.push(`s.status=$${params.length}`);
      }
      if (input.q) {
        params.push(`%${input.q.replace(/[\\%_]/g, (value) => '\\' + value)}%`);
        where.push(`s.name ILIKE $${params.length}`);
      }
      const filter = where.join(' AND ');
      const total = Number(
        (await c.query(`SELECT count(*)::int AS n FROM sequences s WHERE ${filter}`, params))
          .rows[0].n,
      );
      const order = {
        latest: 's.updated_at DESC,s.id',
        name: 's.name,s.id',
        last_sent: 'm.last_sent_at DESC NULLS LAST,s.id',
      }[input.sort];
      const items = (
        await c.query(
          `SELECT s.id,s.name,s.status,s.channel_id,ch.name AS channel_name,s.revision,s.updated_at,jsonb_array_length(s.steps) AS step_count,m.*,e.active,e.completed FROM sequences s JOIN channels ch ON ch.id=s.channel_id LEFT JOIN LATERAL(SELECT count(*)::int AS processed,count(*) FILTER(WHERE status IN('delivered','read'))::int AS delivered,count(*) FILTER(WHERE status='read')::int AS opened,count(*) FILTER(WHERE status='failed')::int AS unreached,max(created_at) FILTER(WHERE status IN('sent','delivered','read')) AS last_sent_at FROM messages WHERE flow_id=s.id AND direction='out' AND NOT is_internal) m ON true LEFT JOIN LATERAL(SELECT count(*) FILTER(WHERE status='active')::int AS active,count(*) FILTER(WHERE status='completed')::int AS completed FROM sequence_enrollments WHERE sequence_id=s.id) e ON true WHERE ${filter} ORDER BY ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, input.limit, (input.page - 1) * input.limit],
        )
      ).rows;
      return { items, total, page: input.page, limit: input.limit };
    });
  }
  private async sequence(c: import('pg').PoolClient, id: string) {
    const row = (await c.query('SELECT * FROM sequences WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!row) throw new NotFoundException('Sequence not found');
    if (row.status !== 'active' || !row.steps?.length)
      throw new BadRequestException('Select an active sequence with at least one step');
    return row;
  }
  async preview(tenant: string, actor: string, id: string, audience: SequenceAudience) {
    return this.db.withTenant(tenant, async (c) => {
      const sequence = await this.sequence(c, id);
      const filter = sequenceAudienceWhere(sequence.channel_id, audience);
      const contacts = (
        await c.query(
          `SELECT c.id,c.name FROM contacts c WHERE ${filter.sql} ORDER BY c.id LIMIT 5001`,
          filter.params,
        )
      ).rows;
      if (contacts.length > 5000)
        throw new BadRequestException(
          'Narrow the audience to at most 5000 contacts per reviewed assignment',
        );
      const review = (
        await c.query(
          'INSERT INTO sequence_bulk_reviews(tenant_id,sequence_id,created_by,sequence_revision,audience,contact_ids) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,expires_at',
          [
            tenant,
            id,
            actor,
            sequence.revision,
            JSON.stringify(audience),
            contacts.map((contact) => contact.id),
          ],
        )
      ).rows[0];
      return {
        reviewId: review.id,
        expiresAt: review.expires_at,
        eligible: contacts.length,
        sample: contacts.slice(0, 10),
        sequenceName: sequence.name,
      };
    });
  }
  async assign(tenant: string, actor: string, id: string, reviewId: string) {
    return this.db.withTenant(tenant, async (c) => {
      const review = (
        await c.query(
          'SELECT * FROM sequence_bulk_reviews WHERE id=$1 AND sequence_id=$2 AND created_by=$3 FOR UPDATE',
          [reviewId, id, actor],
        )
      ).rows[0];
      if (!review) throw new NotFoundException('Audience review not found');
      if (review.consumed_at) return review.result;
      if (new Date(review.expires_at).getTime() <= Date.now())
        throw new ConflictException('Audience review expired; review again');
      const sequence = await this.sequence(c, id);
      if (sequence.revision !== review.sequence_revision)
        throw new ConflictException('Sequence changed after audience review');
      const audience = sequenceAudienceSchema.parse(review.audience);
      const filter = sequenceAudienceWhere(sequence.channel_id, audience);
      filter.params.push(review.contact_ids);
      const eligible = (
        await c.query(
          `SELECT c.id FROM contacts c WHERE ${filter.sql} AND c.id=ANY($${filter.params.length}::uuid[]) ORDER BY c.id`,
          filter.params,
        )
      ).rows.map((row) => row.id);
      const next = computeNextRun(
        new Date(),
        (sequence.steps as SequenceStep[])[0],
        sequence.timezone,
        sequence.delivery_time,
      );
      const inserted = await c.query(
        `INSERT INTO sequence_enrollments(tenant_id,sequence_id,contact_id,next_run_at) SELECT $1,$2,id,$4 FROM unnest($3::uuid[]) AS id ON CONFLICT(sequence_id,contact_id) DO UPDATE SET status='active',step_index=0,next_run_at=EXCLUDED.next_run_at,stop_reason=NULL,last_error=NULL,lease_until=NULL,updated_at=now() WHERE sequence_enrollments.status<>'active' RETURNING id`,
        [tenant, id, eligible, next],
      );
      const result = {
        reviewId,
        reviewed: review.contact_ids.length,
        eligible: eligible.length,
        enrolled: inserted.rows.length,
        alreadyActive: eligible.length - inserted.rows.length,
        excludedSinceReview: review.contact_ids.length - eligible.length,
        nextRunAt: next,
      };
      await c.query('UPDATE sequence_bulk_reviews SET consumed_at=now(),result=$2 WHERE id=$1', [
        reviewId,
        JSON.stringify(result),
      ]);
      return result;
    });
  }
}
