import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { PlansService } from '../plans/plans.service';
import { contactSchema, contactWhere, Filters } from './schemas';
@Injectable()
export class CrmService {
  constructor(
    readonly db: DatabaseService,
    private plans: PlansService,
  ) {}
  async list(tenant: string, filters: Filters, page = 1, limit = 25, sort = 'latest') {
    const w = contactWhere(filters);
    const order =
      (
        {
          latest: 'created_at DESC,id',
          oldest: 'created_at ASC,id',
          name: 'name ASC,id',
        } as Record<string, string>
      )[sort] ?? 'created_at DESC,id';
    return this.db.withTenant(tenant, async (c) => {
      const items = (
        await c.query(
          `SELECT id,name,email,phone,lifecycle,tags,owner_id,attributes,archived_at,merged_into_id,created_at,updated_at,(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name)),'[]') FROM contact_list_members lm JOIN contact_lists l ON l.id=lm.list_id WHERE lm.contact_id=contacts.id) AS lists,(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'status',se.status)),'[]') FROM sequence_enrollments se JOIN sequences s ON s.id=se.sequence_id WHERE se.contact_id=contacts.id) AS sequences,(SELECT COALESCE(jsonb_agg(jsonb_build_object('channelId',cc.channel_id,'status',cc.status)),'[]') FROM contact_consents cc WHERE cc.contact_id=contacts.id) AS consents FROM contacts WHERE ${w.sql} ORDER BY ${order} LIMIT $${w.params.length + 1} OFFSET $${w.params.length + 2}`,
          [...w.params, limit, (page - 1) * limit],
        )
      ).rows;
      const total = (
        await c.query(`SELECT count(*)::int AS n FROM contacts WHERE ${w.sql}`, w.params)
      ).rows[0].n;
      return { items, total, page, limit };
    });
  }
  async get(tenant: string, id: string) {
    return this.db.withTenant(tenant, async (c) => {
      const row = (await c.query('SELECT * FROM contacts WHERE id=$1', [id])).rows[0];
      if (!row) throw new NotFoundException('Contact not found');
      return row;
    });
  }
  summary(tenant: string, filters: Filters) {
    const w = contactWhere(filters);
    const channel = `$${w.params.length + 1}`;
    return this.db.withTenant(
      tenant,
      async (c) =>
        (
          await c.query(
            `SELECT count(*)::int AS total, count(*) FILTER(WHERE archived_at IS NULL)::int AS retained,
       count(*) FILTER(WHERE EXISTS(SELECT 1 FROM contact_consents s WHERE s.contact_id=contacts.id AND s.status='opted_in' AND (${channel}::uuid IS NULL OR s.channel_id=${channel})))::int AS subscribed,
       count(*) FILTER(WHERE EXISTS(SELECT 1 FROM sequence_enrollments e JOIN sequences seq ON seq.id=e.sequence_id WHERE e.contact_id=contacts.id AND e.status='active' AND (${channel}::uuid IS NULL OR seq.channel_id=${channel})))::int AS in_sequences
       FROM contacts WHERE ${w.sql}`,
            [...w.params, filters.channelId ?? null],
          )
        ).rows[0],
    );
  }
  profile(tenant: string, id: string) {
    return this.db.withTenant(tenant, async (c) => {
      const contact = await this.get(tenant, id);
      const lists = (
        await c.query(
          'SELECT l.id,l.name FROM contact_list_members m JOIN contact_lists l ON l.id=m.list_id WHERE m.contact_id=$1 ORDER BY l.name',
          [id],
        )
      ).rows;
      const sequences = (
        await c.query(
          'SELECT s.id,s.name,s.channel_id,e.status,e.next_run_at,e.step_index,e.stop_reason FROM sequence_enrollments e JOIN sequences s ON s.id=e.sequence_id WHERE e.contact_id=$1 ORDER BY e.updated_at DESC',
          [id],
        )
      ).rows;
      const channels = (
        await c.query(
          'SELECT ch.id,ch.name,ch.type FROM contact_channels cc JOIN channels ch ON ch.id=cc.channel_id WHERE cc.contact_id=$1 ORDER BY ch.name',
          [id],
        )
      ).rows;
      const inputs = (
        await c.query(
          "SELECT f.name,s.status,s.updated_at,s.state->'vars' AS answers FROM flow_sessions s JOIN conversations cv ON cv.id=s.conversation_id JOIN flows f ON f.id=s.flow_id WHERE cv.contact_id=$1 ORDER BY s.updated_at DESC LIMIT 50",
          [id],
        )
      ).rows;
      return {
        contact,
        lists,
        sequences,
        channels,
        inputs,
        timeline: await this.timeline(tenant, id),
      };
    });
  }
  patchProfile(
    tenant: string,
    id: string,
    patch: Partial<z.infer<typeof contactSchema>> & { expectedUpdatedAt: string },
  ) {
    return this.db.withTenant(tenant, async (c) => {
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      const current = (await c.query('SELECT * FROM contacts WHERE id=$1 FOR UPDATE', [id]))
        .rows[0];
      if (!current) throw new NotFoundException('Contact not found');
      if (new Date(current.updated_at).getTime() !== new Date(patch.expectedUpdatedAt).getTime())
        throw new ConflictException('Contact changed. Reload the profile before saving.');
      const input = contactSchema.parse({
        name: current.name,
        email: current.email,
        phone: current.phone,
        lifecycle: current.lifecycle,
        tags: current.tags,
        ownerId: current.owner_id,
        ...patch,
        allowDuplicate:
          (patch.email === undefined || patch.email === current.email) &&
          (patch.phone === undefined || patch.phone === current.phone),
        attributes: { ...current.attributes, ...(patch.attributes ?? {}) },
      });
      await this.save(tenant, input, id);
      return this.profile(tenant, id);
    });
  }
  async save(tenant: string, input: z.infer<typeof contactSchema>, id?: string) {
    return this.db.withTenant(tenant, async (c) => {
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      if (id && (await this.get(tenant, id)).merged_into_id)
        throw new ConflictException('Contact has been merged');
      if (
        input.ownerId &&
        !(await c.query('SELECT 1 FROM memberships WHERE user_id=$1', [input.ownerId])).rowCount
      )
        throw new BadRequestException('Owner must be a workspace member');
      if (!input.allowDuplicate && (input.email || input.phone)) {
        const dup = await c.query(
          'SELECT id FROM contacts WHERE merged_into_id IS NULL AND ($3::uuid IS NULL OR id<>$3) AND (($1::text IS NOT NULL AND lower(email)=lower($1)) OR ($2::text IS NOT NULL AND normalize_contact_phone(phone)=normalize_contact_phone($2))) LIMIT 1',
          [input.email ?? null, input.phone ?? null, id ?? null],
        );
        if (dup.rowCount)
          throw new ConflictException('A contact with this email or phone already exists');
      }
      await this.validateAttributes(tenant, input.attributes);
      if (!id) {
        const n = (await c.query('SELECT count(*)::int AS n FROM contacts')).rows[0].n;
        await this.plans.assertWithinLimit(c, 'contacts', n);
      }
      const normalizedPhone = input.phone
        ? (await c.query('SELECT normalize_contact_phone($1) AS phone', [input.phone])).rows[0]
            .phone
        : null;
      const values = [
        input.name,
        input.email?.toLowerCase() ?? null,
        normalizedPhone
          ? (/[+]/.test(input.phone || '') || /^[0٠۰]{2}/.test(input.phone || '') ? '+' : '') +
            normalizedPhone
          : null,
        input.lifecycle,
        [...new Set(input.tags)],
        JSON.stringify(input.attributes),
        input.ownerId ?? null,
      ];
      return (
        await c.query(
          id
            ? `UPDATE contacts SET name=$1,email=$2,phone=$3,lifecycle=$4,tags=$5,attributes=$6,owner_id=$7,updated_at=now() WHERE id=$8 RETURNING *`
            : `INSERT INTO contacts(name,email,phone,lifecycle,tags,attributes,owner_id,tenant_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [...values, id ?? tenant],
        )
      ).rows[0];
    });
  }
  async validateAttributes(tenant: string, attributes: Record<string, unknown>) {
    return this.db.withTenant(tenant, async (c) => {
      const definitions = (await c.query('SELECT key,type FROM crm_fields')).rows;
      for (const field of definitions) {
        const value = attributes[field.key];
        if (value === undefined || value === null) continue;
        if (
          (field.type === 'number' && typeof value !== 'number') ||
          (field.type === 'boolean' && typeof value !== 'boolean') ||
          (field.type === 'text' && typeof value !== 'string') ||
          (field.type === 'date' &&
            (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)))
        )
          throw new BadRequestException(`Invalid custom field: ${field.key}`);
      }
    });
  }
  async timeline(tenant: string, id: string) {
    await this.get(tenant, id);
    return this.db.withTenant(tenant, async (c) => ({
      conversations: (
        await c.query(
          'SELECT cv.id,cv.channel_id,cv.status,cv.handled_by,ch.name AS channel_name,cv.last_message_at FROM conversations cv JOIN channels ch ON ch.id=cv.channel_id WHERE contact_id=$1 ORDER BY last_message_at DESC LIMIT 50',
          [id],
        )
      ).rows,
      notes: (
        await c.query(
          'SELECT n.*,u.full_name AS author FROM crm_notes n LEFT JOIN users u ON u.id=n.created_by WHERE contact_id=$1 ORDER BY created_at DESC LIMIT 100',
          [id],
        )
      ).rows,
      tasks: (
        await c.query('SELECT * FROM crm_tasks WHERE contact_id=$1 ORDER BY due_at LIMIT 100', [id])
      ).rows,
      deals: (
        await c.query(
          'SELECT d.*,p.name AS pipeline_name FROM crm_deals d JOIN crm_pipelines p ON p.id=d.pipeline_id WHERE contact_id=$1 ORDER BY updated_at DESC LIMIT 100',
          [id],
        )
      ).rows,
      consent: (
        await c.query(
          'SELECT c.*,ch.name AS channel_name FROM contact_consents c JOIN channels ch ON ch.id=c.channel_id WHERE contact_id=$1',
          [id],
        )
      ).rows,
      events: (
        await c.query(
          "SELECT id,type,created_at,status FROM domain_events WHERE payload->>'contactId'=$1 ORDER BY seq DESC LIMIT 100",
          [id],
        )
      ).rows,
    }));
  }
}
