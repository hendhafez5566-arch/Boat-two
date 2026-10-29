import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PoolClient } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import {
  campaignList,
  campaignListSchema,
  campaignSummary,
  campaignScopeSchema,
} from './campaign-list';

test('broadcast list and summary share platform, account, tenant and literal-search boundaries', async () => {
  const pg = new PGlite();
  const tenant = '11111111-1111-4111-8111-111111111111',
    foreign = '22222222-2222-4222-8222-222222222222';
  const wa = '33333333-3333-4333-8333-333333333333',
    wa2 = '44444444-4444-4444-8444-444444444444',
    tg = '55555555-5555-4555-8555-555555555555',
    foreignChannel = '66666666-6666-4666-8666-666666666666';
  const id = (n: number) => `77777777-7777-4777-8777-${String(n).padStart(12, '0')}`;
  try {
    await pg.exec(`CREATE ROLE app_user NOSUPERUSER NOBYPASSRLS;
      CREATE TABLE channels(id uuid PRIMARY KEY,tenant_id uuid,name text,type text);
      CREATE TABLE campaigns(id uuid PRIMARY KEY,tenant_id uuid,channel_id uuid,name text,status text,scheduled_at timestamptz,filters jsonb DEFAULT '{}',created_at timestamptz);
      CREATE TABLE messages(id uuid PRIMARY KEY,tenant_id uuid,status text,error text);
      CREATE TABLE campaign_recipients(id uuid PRIMARY KEY,tenant_id uuid,campaign_id uuid,status text,message_id uuid,error text,updated_at timestamptz DEFAULT now());
      DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['channels','campaigns','messages','campaign_recipients'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
        EXECUTE format('CREATE POLICY tenant_policy ON %I USING(tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
        EXECUTE format('GRANT SELECT ON %I TO app_user',t);
      END LOOP; END $$;`);
    for (const [channel, t, type] of [
      [wa, tenant, 'whatsapp'],
      [wa2, tenant, 'whatsapp'],
      [tg, tenant, 'telegram'],
      [foreignChannel, foreign, 'whatsapp'],
    ])
      await pg.query('INSERT INTO channels VALUES($1,$2,$3,$4)', [channel, t, type, type]);
    const rows = [
      [1, tenant, wa, 'Promo 100%_', 'completed', '2026-10-20T12:00:00Z'],
      [2, tenant, wa, 'Canceled', 'canceled', '2026-10-21T12:00:00Z'],
      [3, tenant, wa2, 'Second account', 'draft', '2026-10-22T12:00:00Z'],
      [4, tenant, tg, 'Telegram', 'completed', '2026-10-23T12:00:00Z'],
      [5, foreign, foreignChannel, 'Foreign', 'completed', '2026-10-23T12:00:00Z'],
      [6, tenant, wa, 'Old', 'completed', '2026-09-01T12:00:00Z'],
      [7, tenant, wa, 'Future', 'draft', '2026-11-01T12:00:00Z'],
    ];
    for (const [n, t, ch, name, status, created] of rows)
      await pg.query(
        'INSERT INTO campaigns(id,tenant_id,channel_id,name,status,created_at) VALUES($1,$2,$3,$4,$5,$6)',
        [id(Number(n)), t, ch, name, status, created],
      );
    await pg.query(
      "INSERT INTO messages VALUES($1,$2,'read',null),($3,$2,'failed','Provider error'),($4,$5,'read',null)",
      [id(20), tenant, id(21), id(22), foreign],
    );
    await pg.query(
      "INSERT INTO campaign_recipients(id,tenant_id,campaign_id,status,message_id,error,updated_at) VALUES($1,$2,$3,'queued',$4,null,'2026-10-20T12:00Z'),($5,$2,$3,'failed',$6,'Audience error','2026-10-21T12:00Z'),($7,$8,$9,'queued',$10,null,'2026-10-21T12:00Z')",
      [id(30), tenant, id(1), id(20), id(31), id(21), id(32), foreign, id(5), id(22)],
    );
    await pg.transaction(async (tx) => {
      await tx.exec(
        `SET LOCAL ROLE app_user; SET LOCAL app.tenant_id='${tenant}'; SET LOCAL TIMEZONE='Asia/Dhaka';`,
      );
      const c = {
        query: (sql: string, args?: unknown[]) => tx.query(sql, args),
      } as unknown as Pick<PoolClient, 'query'>;
      const list = await campaignList(
        c,
        campaignListSchema.parse({ channelType: 'whatsapp', paginated: 'true', limit: 2 }),
      );
      assert(!Array.isArray(list));
      assert.equal(list.total, 5);
      assert.equal(list.items.length, 2);
      assert.equal(list.filters.channelType, 'whatsapp');
      const sorted = await campaignList(
        c,
        campaignListSchema.parse({
          channelType: 'whatsapp',
          sort: 'name',
          direction: 'asc',
          paginated: 'true',
        }),
      );
      assert(!Array.isArray(sorted));
      assert.equal(sorted.items[0].name, 'Canceled');
      const reverse = await campaignList(
        c,
        campaignListSchema.parse({
          channelType: 'whatsapp',
          sort: 'name',
          direction: 'desc',
          paginated: 'true',
        }),
      );
      assert(!Array.isArray(reverse));
      assert.equal(reverse.items[0].name, 'Second account');
      const page2 = await campaignList(
        c,
        campaignListSchema.parse({ channelType: 'whatsapp', paginated: 'true', limit: 2, page: 2 }),
      );
      assert(!Array.isArray(page2));
      assert(!page2.items.some((row) => list.items.some((first) => first.id === row.id)));
      const search = await campaignList(
        c,
        campaignListSchema.parse({ channelType: 'whatsapp', q: ' %_ ', paginated: 'true' }),
      );
      assert(!Array.isArray(search));
      assert.equal(search.total, 1);
      assert.deepEqual(search.items[0].metrics, { processed: 2, delivered: 1, read: 1, failed: 1 });
      for (const status of ['canceled', 'cancelled']) {
        const canceled = await campaignList(
          c,
          campaignListSchema.parse({ status, paginated: 'true' }),
        );
        assert(!Array.isArray(canceled));
        assert.equal(canceled.total, 1);
        assert.equal(canceled.items[0].status, 'canceled');
      }
      const mismatched = await campaignList(
        c,
        campaignListSchema.parse({ channelType: 'telegram', channelId: wa, paginated: 'true' }),
      );
      assert(!Array.isArray(mismatched));
      assert.equal(mismatched.total, 0);
      const inaccessible = await campaignList(
        c,
        campaignListSchema.parse({ channelId: foreignChannel, paginated: 'true' }),
      );
      assert(!Array.isArray(inaccessible));
      assert.equal(inaccessible.total, 0);
      assert(Array.isArray(await campaignList(c, campaignListSchema.parse({}))));
      const summary = await campaignSummary(
        c,
        { channelType: 'whatsapp', channelId: wa },
        new Date('2026-10-29T00:00Z'),
      );
      assert.equal(summary.total, 2);
      assert.equal(summary.completed, 1);
      assert.equal(summary.sent, 1);
      assert.equal(summary.failed, 1);
      assert.equal(summary.readRate, 100);
      const allWa = await campaignSummary(
        c,
        { channelType: 'whatsapp' },
        new Date('2026-10-29T00:00Z'),
      );
      assert.equal(allWa.total, 3);
      const foreignSummary = await campaignSummary(
        c,
        { channelId: foreignChannel },
        new Date('2026-10-29T00:00Z'),
      );
      assert.equal(foreignSummary.total, 0);
      assert.equal(foreignSummary.readRate, null);
    });
    assert.equal(campaignScopeSchema.safeParse({ channelType: 'sms' }).success, false);
    assert.equal(campaignListSchema.safeParse({ limit: 101 }).success, false);
    assert.equal(
      campaignListSchema.safeParse({ sort: 'name; DROP TABLE campaigns' }).success,
      false,
    );
    assert.equal(campaignListSchema.safeParse({ status: 'invented' }).success, false);
  } finally {
    await pg.close();
  }
});
