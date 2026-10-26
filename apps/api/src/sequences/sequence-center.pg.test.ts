/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { sequenceAudienceSchema, sequenceCenterQuery } from './sequence-audience';
test('sequence center and reviewed bulk enrollment execute PostgreSQL with RLS and no provider calls', async (t) => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test:test@localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-only-secret-not-used-for-delivery',
    ENCRYPTION_KEY: '0'.repeat(64),
    EXTERNAL_DELIVERY_ENABLED: 'false',
  });
  const { SequenceCenterService } = await import('./sequence-center.service');
  const { SequencesService } = await import('./sequences.service');
  const pg = new PGlite();
  const tenant = '11111111-1111-4111-8111-111111111111',
    other = '22222222-2222-4222-8222-222222222222',
    channel = '33333333-3333-4333-8333-333333333333',
    actor = '44444444-4444-4444-8444-444444444444',
    seq = '55555555-5555-4555-8555-555555555555',
    foreignSeq = '66666666-6666-4666-8666-666666666666',
    list = '77777777-7777-4777-8777-777777777777';
  const als = new AsyncLocalStorage<{ tenant: string; c: any }>();
  const db: any = {
    withTenant: async (id: string, fn: (c: any) => unknown) => {
      const current = als.getStore();
      if (current) {
        assert.equal(id, current.tenant);
        return fn(current.c);
      }
      return pg.transaction(async (tx) => {
        await tx.exec('SET LOCAL ROLE app_user');
        await tx.query("SELECT set_config('app.tenant_id',$1,true)", [id]);
        const c = {
          query: async (sql: string, args: unknown[] = []) => {
            const result = await tx.query(sql, args);
            return { ...result, rowCount: result.affectedRows || result.rows.length };
          },
        };
        return als.run({ tenant: id, c }, () => fn(c));
      });
    },
  };
  const service = new SequenceCenterService(db);
  const sequences = new SequencesService(db, {} as any, {} as any);
  const contact = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
  try {
    await pg.exec(readFileSync(resolve('src/business/test-fixtures/parity.sql'), 'utf8'));
    await pg.exec(
      "ALTER TABLE sequences ADD COLUMN steps jsonb DEFAULT '[]',ADD COLUMN timezone text DEFAULT 'UTC',ADD COLUMN delivery_time text,ADD COLUMN stop_on_reply boolean DEFAULT true,ADD COLUMN updated_at timestamptz DEFAULT now(),ADD COLUMN created_at timestamptz DEFAULT now(),ADD UNIQUE(tenant_id,id); ALTER TABLE messages ADD COLUMN flow_id uuid,ADD COLUMN flow_node_id text; ALTER TABLE sequence_enrollments ADD COLUMN id uuid DEFAULT gen_random_uuid(),ADD COLUMN lease_until timestamptz,ADD COLUMN last_error text,ADD UNIQUE(sequence_id,contact_id); CREATE TABLE channel_delivery_policy(channel_id uuid,tenant_id uuid,marketing_enabled boolean); ALTER TABLE channel_delivery_policy ENABLE ROW LEVEL SECURITY;CREATE POLICY isolate ON channel_delivery_policy USING(tenant_id=current_setting('app.tenant_id',true)::uuid);GRANT SELECT ON channel_delivery_policy TO app_user;",
    );
    await pg.exec(readFileSync(resolve('src/database/migrations/089_inbox_views.sql'), 'utf8'));
    await pg.exec(
      readFileSync(resolve('src/database/migrations/091_sequence_bulk_reviews.sql'), 'utf8'),
    );
    await pg.query('INSERT INTO tenants VALUES($1,$2),($3,$4)', [tenant, 'One', other, 'Two']);
    await pg.query("INSERT INTO users VALUES($1,'Owner')", [actor]);
    await pg.query(
      "INSERT INTO channels(id,tenant_id,name,type) VALUES($1,$2,'WhatsApp','whatsapp')",
      [channel, tenant],
    );
    await pg.query('INSERT INTO channel_delivery_policy VALUES($1,$2,true)', [channel, tenant]);
    const steps = [{ id: 'first', delay: { amount: 1, unit: 'days' }, content: { text: 'Hello' } }];
    await pg.query(
      "INSERT INTO sequences(id,tenant_id,name,channel_id,status,steps) VALUES($1,$2,'Campaign_One',$3,'active',$4),($5,$6,'Foreign',$3,'active',$4)",
      [seq, tenant, channel, JSON.stringify(steps), foreignSeq, other],
    );
    await pg.query("INSERT INTO contact_lists VALUES($1,$2,'VIP')", [list, tenant]);
    for (let n = 1; n <= 7; n++) {
      await pg.query(
        'INSERT INTO contacts(id,tenant_id,name,tags,attributes) VALUES($1,$2,$3,$4,$5)',
        [
          contact(n),
          n === 7 ? other : tenant,
          `Contact ${n}`,
          n === 6 ? ['vip', 'exclude'] : ['vip'],
          JSON.stringify({ city: 'Cairo' }),
        ],
      );
      await pg.query(
        'INSERT INTO contact_channels(tenant_id,contact_id,channel_id,external_id) VALUES($1,$2,$3,$4)',
        [n === 7 ? other : tenant, contact(n), channel, `user${n}`],
      );
      await pg.query(
        'INSERT INTO contact_consents(tenant_id,contact_id,channel_id,status,evidence) VALUES($1,$2,$3,$4,$5)',
        [
          n === 7 ? other : tenant,
          contact(n),
          channel,
          n === 4 ? 'opted_out' : 'opted_in',
          'Fixture consent',
        ],
      );
      await pg.query('INSERT INTO contact_list_members VALUES($1,$2,$3,now())', [
        n === 7 ? other : tenant,
        list,
        contact(n),
      ]);
    }
    await pg.query('UPDATE contacts SET archived_at=now() WHERE id=$1', [contact(5)]);
    await pg.query('UPDATE contact_channels SET blocked_at=now() WHERE contact_id=$1', [
      contact(3),
    ]);
    await pg.query(
      "INSERT INTO sequence_enrollments(tenant_id,sequence_id,contact_id,status,step_index) VALUES($1,$2,$3,'active',2)",
      [tenant, seq, contact(1)],
    );
    await t.test('message metrics, literal search and tenant filtering are real SQL', async () => {
      for (const status of ['read', 'delivered', 'failed', 'queued'])
        await pg.query(
          "INSERT INTO messages(tenant_id,channel_id,flow_id,direction,status) VALUES($1,$2,$3,'out',$4)",
          [tenant, channel, seq, status],
        );
      const data = await service.list(tenant, sequenceCenterQuery.parse({ q: '_', limit: 10 }));
      assert.equal(data.total, 1);
      assert.equal(data.items[0].processed, 4);
      assert.equal(data.items[0].delivered, 2);
      assert.equal(data.items[0].opened, 1);
      assert.equal(data.items[0].unreached, 1);
      assert.equal(data.items[0].active, 1);
      assert.equal(
        (await service.list(tenant, sequenceCenterQuery.parse({ q: 'Foreign' }))).total,
        0,
      );
    });
    const audience = sequenceAudienceSchema.parse({
      includeLabels: ['vip'],
      excludeLabels: ['exclude'],
      includeLists: [list],
      field: { key: 'city', value: 'Cairo' },
    });
    await t.test(
      'review snapshots eligible marketing contacts and rechecks consent before assignment',
      async () => {
        const review = await service.preview(tenant, actor, seq, audience);
        assert.equal(
          review.eligible,
          2,
          'blocked, opted-out, archived, excluded and foreign contacts are omitted',
        );
        await pg.query("UPDATE contact_consents SET status='opted_out' WHERE contact_id=$1", [
          contact(2),
        ]);
        const result = await service.assign(tenant, actor, seq, review.reviewId);
        assert.equal(result.enrolled, 0);
        assert.equal(result.alreadyActive, 1);
        assert.equal(result.excludedSinceReview, 1);
        assert.deepEqual(
          JSON.parse(JSON.stringify(await service.assign(tenant, actor, seq, review.reviewId))),
          JSON.parse(JSON.stringify(result)),
          'retry returns the same receipt',
        );
        assert.equal(
          (
            await pg.query<{ step_index: number }>(
              'SELECT step_index FROM sequence_enrollments WHERE contact_id=$1',
              [contact(1)],
            )
          ).rows[0].step_index,
          2,
        );
        await assert.rejects(() => service.assign(other, actor, seq, review.reviewId), /not found/);
        await assert.rejects(
          () =>
            service.assign(tenant, '99999999-9999-4999-8999-999999999999', seq, review.reviewId),
          /not found/,
        );
      },
    );
    await t.test(
      'new contacts enter once, while changed/expired sequence reviews cannot be applied',
      async () => {
        await pg.query("UPDATE contact_consents SET status='opted_in' WHERE contact_id=$1", [
          contact(2),
        ]);
        const review = await service.preview(tenant, actor, seq, audience);
        const result = await service.assign(tenant, actor, seq, review.reviewId);
        assert.equal(result.enrolled, 1);
        assert.equal(result.alreadyActive, 1);
        const expired = await service.preview(tenant, actor, seq, audience);
        await pg.query(
          "UPDATE sequence_bulk_reviews SET expires_at=now()-interval '1 minute' WHERE id=$1",
          [expired.reviewId],
        );
        await assert.rejects(() => service.assign(tenant, actor, seq, expired.reviewId), /expired/);
        const stale = await service.preview(tenant, actor, seq, audience);
        await sequences.setStatus(tenant, seq, 'paused', 1);
        await assert.rejects(
          () => service.assign(tenant, actor, seq, stale.reviewId),
          /active|changed/,
        );
        await assert.rejects(() => sequences.setStatus(tenant, seq, 'active', 1), /changed/);
        const row = await sequences.get(tenant, seq);
        await sequences.update(tenant, seq, {
          name: 'Updated',
          channelId: channel,
          timezone: 'UTC',
          deliveryTime: null,
          stopOnReply: true,
          steps: steps as any,
          expectedRevision: row.revision,
        });
        await assert.rejects(
          () =>
            sequences.update(tenant, seq, {
              name: 'Lost update',
              channelId: channel,
              timezone: 'UTC',
              stopOnReply: true,
              steps: steps as any,
              expectedRevision: row.revision,
            }),
          /changed/,
        );
      },
    );
  } finally {
    await pg.close();
  }
});
