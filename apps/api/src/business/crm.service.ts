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
  async list(tenant: string, filters: Filters, page = 1, limit = 25) {
    const w = contactWhere(filters);
    return this.db.withTenant(tenant, async (c) => {
      const items = (
        await c.query(
          `SELECT id,name,email,phone,lifecycle,tags,owner_id,attributes,archived_at,merged_into_id,created_at,updated_at FROM contacts WHERE ${w.sql} ORDER BY created_at DESC,id LIMIT $5 OFFSET $6`,
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
          'SELECT cv.id,cv.status,cv.handled_by,ch.name AS channel_name,cv.last_message_at FROM conversations cv JOIN channels ch ON ch.id=cv.channel_id WHERE contact_id=$1 ORDER BY last_message_at DESC LIMIT 50',
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
