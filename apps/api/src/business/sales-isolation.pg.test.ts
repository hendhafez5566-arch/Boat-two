import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
test('CRM V3 notifications and action receipts enforce PostgreSQL tenant RLS', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      `CREATE ROLE app_user;CREATE TABLE tenants(id uuid PRIMARY KEY);CREATE TABLE users(id uuid PRIMARY KEY);CREATE TABLE memberships(tenant_id uuid,user_id uuid,PRIMARY KEY(tenant_id,user_id));CREATE TABLE contacts(id uuid,tenant_id uuid,owner_id uuid,PRIMARY KEY(tenant_id,id));CREATE TABLE crm_deals(id uuid,owner_id uuid);CREATE TABLE conversations(id uuid,assigned_to uuid);`,
    );
    await pg.exec(readFileSync('src/database/migrations/102_crm_v3_internal.sql', 'utf8'));
    const a = randomUUID(),
      b = randomUUID(),
      user = randomUUID(),
      contact = randomUUID();
    await pg.query('INSERT INTO tenants VALUES($1),($2)', [a, b]);
    await pg.query('INSERT INTO users VALUES($1)', [user]);
    await pg.query('INSERT INTO memberships VALUES($1,$3),($2,$3)', [a, b, user]);
    await pg.query('INSERT INTO contacts(id,tenant_id) VALUES($1,$2)', [contact, a]);
    await pg.exec('SET ROLE app_user');
    await pg.query("SELECT set_config('app.tenant_id',$1,false)", [a]);
    const insert = `INSERT INTO crm_notifications(tenant_id,user_id,kind,resource_type,resource_id,contact_id,title,dedupe_key) VALUES($1,$2,'new_lead','contact',$3,$3,'Synthetic','one') ON CONFLICT DO NOTHING`;
    await pg.query(insert, [a, user, contact]);
    await pg.query(insert, [a, user, contact]);
    assert.equal((await pg.query('SELECT * FROM crm_notifications')).rows.length, 1);
    await pg.query(
      'INSERT INTO automation_action_receipts(tenant_id,execution_key) VALUES($1,$2)',
      [a, 'test-event:action'],
    );
    await pg.query("SELECT set_config('app.tenant_id',$1,false)", [b]);
    assert.equal((await pg.query('SELECT * FROM crm_notifications')).rows.length, 0);
    assert.equal((await pg.query('SELECT * FROM automation_action_receipts')).rows.length, 0);
    assert.equal(
      (await pg.query("UPDATE crm_notifications SET title='forbidden' RETURNING id")).rows.length,
      0,
    );
    await assert.rejects(() => pg.query(insert, [a, user, contact]), /row-level security/);
    await assert.rejects(
      () =>
        pg.query('INSERT INTO automation_action_receipts(tenant_id,execution_key) VALUES($1,$2)', [
          a,
          'forbidden',
        ]),
      /row-level security/,
    );
  } finally {
    await pg.close();
  }
});
