import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
test('local categories persist, preserve legacy edits and enforce tenant isolation', async () => {
  Object.assign(process.env, {
    DATABASE_URL: 'postgres://test:test@localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'isolated-product-category-secret',
    ENCRYPTION_KEY: '0'.repeat(64),
  });
  const { CommerceService } = await import('./commerce.service');
  const pg = new PGlite();
  const a = '11111111-1111-4111-8111-111111111111',
    b = '22222222-2222-4222-8222-222222222222';
  try {
    await pg.exec(`CREATE ROLE app_user NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO app_user;CREATE TABLE tenants(id uuid PRIMARY KEY);INSERT INTO tenants VALUES('${a}'),('${b}');
 CREATE TABLE catalog_products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),sku text,name text,description text,price_cents bigint,currency text,image_url text,link_url text,catalog_id text,retailer_id text,archived boolean,source_id uuid,updated_at timestamptz DEFAULT now());
 ALTER TABLE catalog_products ENABLE ROW LEVEL SECURITY;ALTER TABLE catalog_products FORCE ROW LEVEL SECURITY;CREATE POLICY tenant_isolation ON catalog_products USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);GRANT SELECT,INSERT,UPDATE ON catalog_products TO app_user;`);
    await pg.exec(readFileSync('src/database/migrations/105_product_categories.sql', 'utf8'));
    const db = {
      withTenant: async <T>(
        tenant: string,
        fn: (c: {
          query: (sql: string, args?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
        }) => Promise<T>,
      ) =>
        pg.transaction(async (tx) => {
          await tx.exec('SET LOCAL ROLE app_user');
          await tx.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
          return fn({ query: async (sql, args = []) => tx.query(sql, args) });
        }),
    };
    const service = new CommerceService(db as never, {} as never, {} as never);
    const c = await service.saveCategory(a, 'Tours');
    assert.equal((await service.categories(a))[0].name, 'Tours');
    assert.deepEqual(await service.categories(b), []);
    await assert.rejects(service.saveCategory(b, 'Stolen', String(c.id)), /unavailable/);
    const input = {
      name: 'Tour',
      sku: 'TOUR-1',
      description: '',
      priceCents: '15000',
      currency: 'EGP',
      archived: false,
    };
    const p = await service.saveProduct(a, { ...input, categoryId: String(c.id) });
    assert.equal(p.category_id, c.id);
    assert.equal(String(p.price_cents), '15000');
    const edited = await service.saveProduct(a, { ...input, name: 'Updated' }, String(p.id));
    assert.equal(edited.category_id, c.id, 'legacy clients must not clear category');
    await service.saveCategory(a, 'Trips', String(c.id));
    assert.equal((await service.categories(a))[0].name, 'Trips');
    assert.deepEqual(await service.products(b), []);
    await assert.rejects(service.saveProduct(b, { ...input, categoryId: String(c.id) }));
    await assert.rejects(service.saveProduct(b, input, String(p.id)));
    const cleared = await service.saveProduct(a, { ...input, categoryId: null }, String(p.id));
    assert.equal(cleared.category_id, null);
  } finally {
    await pg.close();
  }
});
