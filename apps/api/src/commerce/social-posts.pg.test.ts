import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { socialSchema } from './contracts';

test('social drafts preserve campaign metadata, migration is repeatable, and RLS blocks foreign accounts', async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test:test@localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-only-secret-for-local-validation',
    ENCRYPTION_KEY: '0'.repeat(64),
    EXTERNAL_DELIVERY_ENABLED: 'false',
  });
  const { SocialService } = await import('./social.service');
  const pg = new PGlite();
  const tenant = '11111111-1111-4111-8111-111111111111',
    other = '22222222-2222-4222-8222-222222222222';
  const fb = '33333333-3333-4333-8333-333333333333',
    foreign = '44444444-4444-4444-8444-444444444444',
    ig = '55555555-5555-4555-8555-555555555555';
  const migration = readFileSync('src/database/migrations/093_social_post_name.sql', 'utf8');
  let active: { query: (sql: string, args?: unknown[]) => Promise<unknown> } | null = null;
  const wrap = (tx: {
    query: (sql: string, args?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }>;
  }) => ({
    query: async (sql: string, args?: unknown[]) => {
      const r = await tx.query(sql, args);
      return { ...r, rowCount: r.affectedRows || r.rows.length };
    },
  });
  const db = {
    withTenant: async (id: string, fn: (c: unknown) => Promise<unknown>) => {
      if (active) return fn(active);
      return pg.transaction(async (tx) => {
        await tx.exec('SET LOCAL ROLE app_user');
        await tx.query("SELECT set_config('app.tenant_id',$1,true)", [id]);
        active = wrap(tx);
        try {
          return await fn(active);
        } finally {
          active = null;
        }
      });
    },
  };
  try {
    await pg.exec(`CREATE ROLE app_user NOSUPERUSER NOBYPASSRLS;
      CREATE TABLE channels(id uuid PRIMARY KEY,tenant_id uuid,name text,type text);
      CREATE TABLE social_posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,channel_id uuid,kind text,body text,media_urls jsonb,link_url text,status text DEFAULT 'draft',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      ALTER TABLE channels ENABLE ROW LEVEL SECURITY; ALTER TABLE channels FORCE ROW LEVEL SECURITY;
      ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY; ALTER TABLE social_posts FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_policy ON channels USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
      CREATE POLICY tenant_policy ON social_posts USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
      GRANT SELECT ON channels TO app_user; GRANT SELECT,INSERT,UPDATE ON social_posts TO app_user;
    `);
    await pg.query(
      "INSERT INTO channels VALUES($1,$2,'Page','facebook'),($3,$4,'Foreign','facebook'),($5,$2,'IG','instagram')",
      [fb, tenant, foreign, other, ig],
    );
    await pg.exec(migration);
    const service = new SocialService(db as never, {} as never, {} as never);
    const input = socialSchema.parse({
      name: '  Campaign  ',
      format: 'multimedia',
      channelId: fb,
      kind: 'carousel',
      body: 'Text',
      mediaUrls: ['https://example.test/one.png', 'https://example.test/two.png'],
    });
    const saved = await service.save(tenant, input);
    assert.equal(saved.name, 'Campaign');
    assert.equal(saved.format, 'multimedia');
    assert.equal(saved.status, 'draft');
    await pg.exec(migration); // A new multimedia carousel must keep its explicit category.
    const listed = await service.list(tenant);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].format, 'multimedia');
    const edited = await service.save(tenant, { ...input, name: 'Changed' }, saved.id);
    assert.equal(edited.name, 'Changed');
    const legacyEdit = await service.save(
      tenant,
      { ...input, name: undefined, format: undefined },
      saved.id,
    );
    assert.equal(legacyEdit.name, 'Changed');
    assert.equal(legacyEdit.format, 'multimedia');
    await assert.rejects(service.save(other, input), /Choose a Facebook/);
    await assert.rejects(
      service.save(tenant, { ...input, channelId: foreign }),
      /Choose a Facebook/,
    );
    await assert.rejects(
      service.save(tenant, socialSchema.parse({ channelId: ig, kind: 'text', body: 'No image' })),
      /Instagram publishing requires/,
    );
    await pg.query("UPDATE social_posts SET status='failed' WHERE id=$1", [saved.id]);
    const retry = await service.retry(tenant, saved.id);
    assert.equal(retry.name, 'Changed');
    assert.equal(retry.format, 'multimedia');
    assert.equal(retry.status, 'draft');
    await assert.rejects(service.save(tenant, input, saved.id), /Only a draft/);
    const legacy = await service.save(
      tenant,
      socialSchema.parse({
        channelId: fb,
        kind: 'cta',
        body: 'CTA',
        linkUrl: 'https://example.test',
      }),
    );
    assert.equal(legacy.format, 'cta');
    assert.equal(socialSchema.safeParse({ ...input, name: 'a'.repeat(121) }).success, false);
    assert.equal(socialSchema.safeParse({ ...input, format: 'invented' }).success, false);
    assert.equal(socialSchema.safeParse({ ...input, format: 'cta' }).success, false);
  } finally {
    await pg.close();
  }
});
