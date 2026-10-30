import { itemText } from './data-contracts';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { GoogleService } from '../integrations/google.service';
import { ExternalEffects } from '../events/external-effect';
import { OutContent } from '../flows/engine/types';
import { isIntervalOpen } from '../flows/engine/hours';
import { productSchema, serviceSchema, bookingSchema, priceText } from './contracts';
import { z } from 'zod';
@Injectable()
export class CommerceService {
  constructor(
    private db: DatabaseService,
    private google: GoogleService,
    private effects: ExternalEffects,
  ) {}
  products(tenant: string) {
    return this.db.withTenant(
      tenant,
      async (c) =>
        (
          await c.query(
            'SELECT * FROM catalog_products WHERE source_id IS NULL ORDER BY archived,name LIMIT 500',
          )
        ).rows,
    );
  }
  saveProduct(tenant: string, input: z.infer<typeof productSchema>, id?: string) {
    return this.db.withTenant(
      tenant,
      async (c) =>
        (
          await c.query(
            `INSERT INTO catalog_products(id,tenant_id,sku,name,description,price_cents,currency,image_url,link_url,catalog_id,retailer_id,archived) VALUES(COALESCE($1::uuid,gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO UPDATE SET sku=EXCLUDED.sku,name=EXCLUDED.name,description=EXCLUDED.description,price_cents=EXCLUDED.price_cents,currency=EXCLUDED.currency,image_url=EXCLUDED.image_url,link_url=EXCLUDED.link_url,catalog_id=EXCLUDED.catalog_id,retailer_id=EXCLUDED.retailer_id,archived=EXCLUDED.archived,updated_at=now() WHERE catalog_products.source_id IS NULL RETURNING *`,
            [
              id ?? null,
              tenant,
              input.sku,
              input.name,
              input.description,
              input.priceCents,
              input.currency,
              input.imageUrl ?? null,
              input.linkUrl ?? null,
              input.catalogId ?? null,
              input.retailerId ?? null,
              input.archived,
            ],
          )
        ).rows[0],
    );
  }
  async productContent(tenant: string, id: string, native: boolean): Promise<OutContent> {
    const p = await this.db.withTenant(
      tenant,
      async (c) =>
        (await c.query('SELECT * FROM catalog_products WHERE id=$1 AND NOT archived', [id]))
          .rows[0],
    );
    if (!p) throw new NotFoundException('Product unavailable');
    const text = p.source_id
      ? itemText(p)
      : `${p.name}\n${p.description.slice(0, 850)}\n${priceText(p.price_cents, p.currency)}`;
    if (native) {
      if (!p.catalog_id || !p.retailer_id)
        throw new BadRequestException(
          'Native product requires an approved provider catalog and retailer ID',
        );
      return {
        text: `${p.name}\n${p.description}`.slice(0, 1024),
        product: { catalogId: p.catalog_id, retailerId: p.retailer_id },
      };
    }
    return {
      text,
      ...(p.image_url ? { media: { kind: 'image' as const, url: p.image_url } } : {}),
      ...(p.link_url ? { cta: { text: 'View product', url: p.link_url } } : {}),
    };
  }
  async catalogContent(
    tenant: string,
    ids: string[],
    native: boolean,
    text: string,
    selectable = false,
  ): Promise<OutContent> {
    if (native) {
      const rows = await this.db.withTenant(
        tenant,
        async (c) =>
          (
            await c.query(
              'SELECT * FROM catalog_products WHERE id=ANY($1::uuid[]) AND NOT archived',
              [ids],
            )
          ).rows,
      );
      if (
        rows.length !== new Set(ids).size ||
        !rows.length ||
        rows.some((p) => !p.catalog_id || !p.retailer_id || p.catalog_id !== rows[0].catalog_id)
      )
        throw new BadRequestException('Products must belong to one approved provider catalog');
      return {
        text,
        productList: {
          catalogId: rows[0].catalog_id,
          sections: [{ title: 'Products', retailerIds: rows.map((p) => p.retailer_id) }],
        },
      };
    }
    const rows = await this.db.withTenant(
      tenant,
      async (c) =>
        (
          await c.query(
            'SELECT * FROM catalog_products WHERE id=ANY($1::uuid[]) AND NOT archived',
            [ids],
          )
        ).rows,
    );
    if (rows.length !== new Set(ids).size || !rows.length)
      throw new BadRequestException('Catalog contains unavailable products');
    const ordered = ids.map((id) => rows.find((p) => p.id === id)!);
    if (selectable) {
      if (ordered.length > 10)
        throw new BadRequestException('Selectable catalogs support at most 10 products');
      return {
        text,
        list: {
          buttonText: 'Products',
          sections: [
            {
              title: 'Products',
              rows: ordered.map((p) => ({
                id: 'product:' + p.id,
                title: p.name.slice(0, 24),
                description: (p.source_id
                  ? (p.dynamic_fields ?? [])
                      .map((f: { label: string; value: string }) => f.label + ': ' + f.value)
                      .join(' • ')
                  : priceText(p.price_cents, p.currency)
                ).slice(0, 72),
              })),
            },
          ],
        },
      };
    }
    return {
      text: [
        text,
        ...ordered.map(
          (p) =>
            `${p.name} — ${p.source_id ? itemText(p) : priceText(p.price_cents, p.currency)}${p.link_url ? ' ' + p.link_url : ''}`,
        ),
      ].join('\n'),
    };
  }
  services(tenant: string) {
    return this.db.withTenant(
      tenant,
      async (c) => (await c.query('SELECT * FROM appointment_services ORDER BY name')).rows,
    );
  }
  saveService(tenant: string, v: z.infer<typeof serviceSchema>) {
    return this.db.withTenant(tenant, async (c) => {
      if (
        v.calendarConnectionId &&
        !(
          await c.query("SELECT 1 FROM integration_connections WHERE id=$1 AND provider='google'", [
            v.calendarConnectionId,
          ])
        ).rowCount
      )
        throw new BadRequestException('Google connection not found');
      return (
        await c.query(
          'INSERT INTO appointment_services(tenant_id,name,duration_minutes,timezone,schedule,calendar_connection_id,calendar_id,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
          [
            tenant,
            v.name,
            v.durationMinutes,
            v.timezone,
            JSON.stringify(v.schedule),
            v.calendarConnectionId ?? null,
            v.calendarId,
            v.enabled,
          ],
        )
      ).rows[0];
    });
  }
  bookings(tenant: string) {
    return this.db.withTenant(
      tenant,
      async (c) =>
        (
          await c.query(
            'SELECT a.*,s.name AS service_name,ct.name AS contact_name FROM appointments a JOIN appointment_services s ON s.id=a.service_id JOIN contacts ct ON ct.id=a.contact_id ORDER BY a.starts_at DESC LIMIT 200',
          )
        ).rows,
    );
  }
  async book(tenant: string, input: z.infer<typeof bookingSchema>) {
    return this.db.withTenant(tenant, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [input.serviceId]);
      const prior = (
        await c.query('SELECT * FROM appointments WHERE event_key=$1', [input.eventKey])
      ).rows[0];
      if (prior) {
        if (
          prior.service_id !== input.serviceId ||
          prior.contact_id !== input.contactId ||
          new Date(prior.starts_at).getTime() !== new Date(input.start).getTime()
        )
          throw new ConflictException('Booking replay changed its input');
        return prior;
      }
      const service = (
        await c.query('SELECT * FROM appointment_services WHERE id=$1 AND enabled', [
          input.serviceId,
        ])
      ).rows[0];
      if (!service) throw new NotFoundException('Appointment service unavailable');
      if (!(await c.query('SELECT 1 FROM contacts WHERE id=$1', [input.contactId])).rowCount)
        throw new NotFoundException('Contact not found');
      const start = new Date(input.start),
        end = new Date(start.getTime() + service.duration_minutes * 60000);
      if (start <= new Date()) throw new BadRequestException('Choose a future appointment');
      if (
        Object.keys(service.schedule).length &&
        !isIntervalOpen(start, end, service.timezone, service.schedule)
      )
        throw new ConflictException('Outside service opening hours');
      const conflict = (
        await c.query(
          "SELECT 1 FROM appointments WHERE service_id=$1 AND status='confirmed' AND starts_at<$3 AND ends_at>$2 LIMIT 1",
          [input.serviceId, start, end],
        )
      ).rowCount;
      if (conflict) throw new ConflictException('Appointment slot is unavailable');
      if (input.dryRun)
        return {
          mock: true,
          persisted: false,
          available: true,
          start: start.toISOString(),
          end: end.toISOString(),
        };
      return (
        await c.query(
          'INSERT INTO appointments(tenant_id,service_id,contact_id,starts_at,ends_at,event_key,calendar_status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
          [
            tenant,
            input.serviceId,
            input.contactId,
            start,
            end,
            input.eventKey,
            service.calendar_connection_id ? 'pending' : 'not_requested',
          ],
        )
      ).rows[0];
    });
  }
  cancel(tenant: string, id: string) {
    return this.db.withTenant(tenant, (c) =>
      c
        .query("UPDATE appointments SET status='cancelled' WHERE id=$1 RETURNING *", [id])
        .then((r) => r.rows[0]),
    );
  }
  async syncCalendar(tenant: string, id: string) {
    const row = await this.db.withTenant(
      tenant,
      async (c) =>
        (
          await c.query(
            "SELECT a.*,s.name,s.timezone,s.calendar_connection_id,s.calendar_id FROM appointments a JOIN appointment_services s ON s.id=a.service_id WHERE a.id=$1 AND a.status='confirmed'",
            [id],
          )
        ).rows[0],
    );
    if (!row?.calendar_connection_id)
      throw new BadRequestException('Booking has no authorized Calendar connection');
    if (row.calendar_event_id) return { alreadyLinked: true, id: row.calendar_event_id };
    try {
      const result = (await this.db.eventScope('appointment:' + id, () =>
        this.effects.execute(
          tenant,
          { bookingId: id, start: row.starts_at, end: row.ends_at },
          () =>
            this.google.execute(tenant, row.calendar_connection_id, {
              operation: 'calendar_event',
              calendarId: row.calendar_id,
              summary: row.name,
              start: new Date(row.starts_at).toISOString(),
              end: new Date(row.ends_at).toISOString(),
              timezone: row.timezone,
            }),
        ),
      )) as { data?: { id?: string } };
      if (!result.data?.id) throw new Error('Calendar returned no event ID');
      await this.db.withTenant(tenant, (c) =>
        c.query(
          "UPDATE appointments SET calendar_status='linked',calendar_event_id=$2,calendar_error=NULL WHERE id=$1",
          [id, result.data!.id],
        ),
      );
      return { linked: true, id: result.data.id };
    } catch (e) {
      await this.db.withTenant(tenant, (c) =>
        c.query(
          "UPDATE appointments SET calendar_status='needs_action',calendar_error=$2 WHERE id=$1",
          [id, 'Calendar authorization or delivery requires reconciliation'],
        ),
      );
      throw e;
    }
  }
}
