import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = require('pg');
const admin = new Client({ connectionString: process.env.DATABASE_ADMIN_URL }),
  app = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await Promise.all([admin.connect(), app.connect()]);
  const baseline = (
    await admin.query("SELECT platform_operational_report('2100-04-01','2100-05-01') AS data")
  ).rows[0].data;
  const before = baseline.paidInvoicesByCurrency.find((r) => r.currency === 'cad');
  const tenant = randomUUID(),
    invoice = 'in_report_' + randomUUID().replaceAll('-', ''),
    created = Math.floor(Date.parse('2100-04-01T00:00:00Z') / 1000);
  await admin.query("INSERT INTO tenants(id,name,slug) VALUES($1,'Report fixture',$2)", [
    tenant,
    'report-' + tenant,
  ]);
  await admin.query(
    "INSERT INTO billing_invoices(provider_id,tenant_id,status,currency,amount_due,amount_paid,amount_remaining,provider_created,event_created,event_rank,paid_at) VALUES($1,$2,'paid','cad',1500,1500,0,$3,$3,6,'2100-04-03T00:00:00Z')",
    [invoice, tenant, created],
  );
  await assert.rejects(
    () => app.query("SELECT platform_operational_report('2100-04-01','2100-05-01')"),
    /permission denied/,
  );
  await admin.query('SET ROLE boat_platform');
  const data = (
    await admin.query("SELECT platform_operational_report('2100-04-01','2100-05-01') AS data")
  ).rows[0].data;
  const paid = data.paidInvoicesByCurrency.find((r) => r.currency === 'cad');
  assert.equal(paid.invoices, (before?.invoices ?? 0) + 1);
  assert.equal(
    Number(paid.gross_paid_minor_units),
    Number(before?.gross_paid_minor_units ?? 0) + 1500,
  );
  assert.equal(
    data.invoiceCohortByCurrency.find((r) => r.currency === 'cad').remaining_minor_units,
    '0',
  );
  assert.ok(data.companies.total >= 1);
  assert.ok(data.queues.eventsPending >= 0);
  const outside = (
    await admin.query("SELECT platform_operational_report('2100-04-04','2100-05-01') AS data")
  ).rows[0].data;
  assert.deepEqual(outside.paidInvoicesByCurrency, []);
  await assert.rejects(
    () => admin.query("SELECT platform_operational_report('2100-04-01','2102-05-01')"),
    /Invalid report range/,
  );
  await assert.rejects(() => admin.query('SELECT * FROM billing_invoices'), /permission denied/);
  console.log(
    'PASS platform reports: restricted aggregate function, paid-date range, separated currencies, invoice cohorts, queue state, bounded ranges and no raw-table grants.',
  );
} finally {
  await Promise.all([admin.end(), app.end()]);
}
