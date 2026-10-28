import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { invoiceListSchema, listInvoices } from './invoice-list';
test('invoice log uses literal search, UTC paid dates, consistent pages and tenant RLS', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE ROLE app_user NOSUPERUSER NOBYPASSRLS;
      CREATE TABLE billing_invoices(provider_id text PRIMARY KEY,tenant_id text,number text,status text,currency text,amount_due bigint DEFAULT 100,amount_paid bigint DEFAULT 100,amount_remaining bigint DEFAULT 0,attempted_count int DEFAULT 1,payment_failed boolean DEFAULT false,hosted_url text,pdf_url text,due_at timestamptz,provider_created bigint DEFAULT 1,paid_at timestamptz,updated_at timestamptz DEFAULT now());
      ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY; ALTER TABLE billing_invoices FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_policy ON billing_invoices USING(tenant_id=current_setting('app.tenant_id',true));
      GRANT SELECT ON billing_invoices TO app_user;
      INSERT INTO billing_invoices(provider_id,tenant_id,number,status,currency,paid_at) VALUES
        ('start','one','A%_','paid','usd','2026-10-28 00:00Z'),('end','one','Second','paid','usd','2026-10-28 23:59:59Z'),
        ('next','one','Next','paid','usd','2026-10-29 00:00Z'),('old','one','Old','paid','usd','2026-10-27 23:59:59Z'),
        ('no_date','one','Undated','paid','usd',null),('due','one','Due','open','usd',null),('foreign','two','Foreign','paid','usd','2026-10-28 10:00Z');
      INSERT INTO billing_invoices(provider_id,tenant_id,number,status,currency,paid_at)
        SELECT 'many_'||i,'one','Many '||i,'paid','usd','2026-10-28 12:00Z' FROM generate_series(1,8) i;
    `);
    await pg.transaction(async (tx) => {
      await tx.exec(
        "SET LOCAL ROLE app_user; SET LOCAL app.tenant_id='one'; SET LOCAL TIMEZONE='Asia/Dhaka'",
      );
      const c = {
        query: (sql: string, args?: unknown[]) => tx.query(sql, args),
      } as unknown as Pick<PoolClient, 'query'>;
      const q = invoiceListSchema.parse({
        status: 'paid',
        from: '2026-10-28',
        to: '2026-10-28',
        limit: 5,
      });
      const a = await listInvoices(c, q),
        b = await listInvoices(c, { ...q, page: 2 });
      assert.equal(a.total, 10);
      assert.equal(b.total, 10);
      assert.equal(a.items.length, 5);
      assert.equal(b.items.length, 5);
      const ids = [...a.items, ...b.items].map((x) => x.provider_id);
      assert.equal(new Set(ids).size, 10);
      assert.ok(ids.includes('start'));
      assert.ok(ids.includes('end'));
      for (const id of ['next', 'old', 'no_date', 'due', 'foreign']) assert.ok(!ids.includes(id));
      const literal = await listInvoices(c, { ...q, search: '%_' });
      assert.equal(literal.total, 1);
      assert.equal(literal.items[0].provider_id, 'start');
      const defaults = await listInvoices(c, invoiceListSchema.parse({}));
      assert.equal(defaults.limit, 50);
      assert.equal(defaults.total, 14);
    });
    for (const value of [
      { from: '2026-02-30' },
      { from: '2026-10-29', to: '2026-10-28' },
      { limit: 17 },
      { page: 0 },
      { search: 'a'.repeat(201) },
    ])
      assert.equal(invoiceListSchema.safeParse(value).success, false);
  } finally {
    await pg.close();
  }
});
