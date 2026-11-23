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
    await pg.exec(readFileSync('src/database/migrations/106_product_details.sql', 'utf8'));
    await pg.exec(readFileSync('src/database/migrations/107_local_product_delete_grant.sql', 'utf8'));
    await pg.exec(readFileSync('src/database/migrations/115_product_category_tree.sql', 'utf8'));
    await pg.exec("ALTER TABLE catalog_products ADD COLUMN checkout jsonb NOT NULL DEFAULT '{}'");
    // Flow references are JSON rather than direct FKs, so deletion must guard them.
    await pg.exec(`
      CREATE TABLE flows(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,draft_graph jsonb NOT NULL DEFAULT '{}');
      CREATE TABLE flow_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,graph jsonb NOT NULL DEFAULT '{}');
      CREATE TABLE flow_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,state jsonb NOT NULL DEFAULT '{}');
      GRANT SELECT ON flows,flow_versions,flow_sessions TO app_user;
    `);
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
    const disposable = await service.saveCategory(a, 'Disposable empty category');
    await assert.rejects(service.removeCategory(b, String(disposable.id)), /unavailable/);
    assert.deepEqual(await service.removeCategory(a, String(disposable.id)), { deleted: true });
    assert.equal((await service.categories(a)).some((item) => item.id === disposable.id), false);
    await assert.rejects(service.removeCategory(a, String(disposable.id)), /unavailable/);
    const specifications = [{ name: 'Duration', value: '4 days' }];
    const options = [{ name: 'Double room', priceCents: '19500' }];
    const p = await service.saveProduct(a, {
      ...input,
      categoryId: String(c.id),
      specifications,
      options,
      catalogId: 'provider',
      retailerId: 'retailer',
    });
    assert.equal(p.category_id, c.id);
    await assert.rejects(service.removeCategory(a, String(c.id)), /Move all products/);
    assert.equal(String(p.price_cents), '15000');
    const archiveCategory = await service.saveCategory(a, 'Archive guard');
    const archivedProduct = await service.saveProduct(a, { ...input, sku: 'ARCHIVE-GUARD', categoryId: String(archiveCategory.id), archived: true });
    await assert.rejects(service.removeCategory(a, String(archiveCategory.id)), /Move all products/);
    assert.equal((await service.products(a)).find((item) => item.id === archivedProduct.id)?.archived, true);

    const edited = await service.saveProduct(
      a,
      { ...input, name: 'Updated', catalogId: 'provider', retailerId: 'retailer' },
      String(p.id),
    );
    assert.equal(edited.category_id, c.id, 'legacy clients must not clear category');
    assert.deepEqual(edited.specifications, specifications);
    assert.deepEqual(edited.options, options);
    await assert.rejects(service.duplicateCategory(b, String(c.id), 'Foreign copy'), /unavailable/);
    const copy = await service.duplicateCategory(a, String(c.id), 'Copied tours');
    assert.equal(copy.product_count, 1);
    await assert.rejects(service.duplicateCategory(a, String(c.id), 'Copied tours'));
    const copied = (await service.products(a)).find((item) => item.category_id === copy.id);
    assert.notEqual(copied.id, p.id);
    assert.notEqual(copied.sku, p.sku);
    assert.deepEqual(copied.specifications, specifications);
    assert.deepEqual(copied.options, options);
    assert.equal(copied.catalog_id, null);
    await service.saveProduct(a, { ...input, sku: copied.sku, options: [] }, copied.id);
    assert.deepEqual((await service.products(a)).find((item) => item.id === p.id).options, options);
    await service.saveCategory(a, 'Trips', String(c.id));
    assert.equal((await service.categories(a)).find((item) => item.id === c.id)?.name, 'Trips');
    assert.deepEqual(await service.products(b), []);
    await assert.rejects(service.saveProduct(b, { ...input, categoryId: String(c.id) }));
    await assert.rejects(service.saveProduct(b, input, String(p.id)));
    const cleared = await service.saveProduct(a, { ...input, categoryId: null }, String(p.id));
    assert.equal(cleared.category_id, null);
    const root = await service.saveCategory(a, 'Parent');
    const child = await service.saveCategory(a, 'Subcategory', undefined, root.id);
    const grandchild = await service.saveCategory(a, 'Third level', undefined, child.id);
    await assert.rejects(service.saveCategory(a, 'Parent', root.id, grandchild.id), /outside/);
    await assert.rejects(service.saveCategory(a, 'Subcategory', child.id, child.id), /outside/);
    await assert.rejects(service.saveCategory(b, 'Foreign child', undefined, child.id), /unavailable/);
    await assert.rejects(service.removeCategory(a, root.id), /subcategories/);
    await service.saveCategory(a, 'Renamed child', child.id);
    assert.equal((await service.categories(a)).find((row) => row.id === child.id).parent_id, root.id);
    await service.saveProduct(a, { ...input, sku: 'NESTED', categoryId: grandchild.id });
    const treeCopy = await service.duplicateCategory(a, root.id, 'Parent copy');
    const branch = await service.categories(a);
    const childCopy = branch.find((row) => row.parent_id === treeCopy.id);
    const grandchildCopy = branch.find((row) => row.parent_id === childCopy.id);
    assert.equal(childCopy.name, 'Renamed child');
    assert.equal(grandchildCopy.name, 'Third level');
    assert.equal(treeCopy.product_count, 1);
    assert.equal((await service.products(a)).find((row) => row.category_id === grandchildCopy.id).name, input.name);
    assert.equal((await service.saveCategory(a, 'Third level', grandchild.id, null)).parent_id, null);
    const removable = await service.saveProduct(a, { ...input, sku: 'SAFE-REMOVE' });
    await assert.rejects(service.removeProduct(b, String(removable.id)), /Product unavailable/);
    await pg.query('INSERT INTO flows(tenant_id,draft_graph) VALUES($1,$2::jsonb)', [
      a, JSON.stringify({ nodes: [{ data: { productId: removable.id } }] }),
    ]);
    await assert.rejects(service.removeProduct(a, String(removable.id)), /Product is used/);
    await assert.rejects(service.archiveProduct(a, String(removable.id)), /Product is used/);
    await pg.query('DELETE FROM flows WHERE tenant_id=$1', [a]);
    await pg.query('INSERT INTO flow_versions(tenant_id,graph) VALUES($1,$2::jsonb)', [
      a, JSON.stringify({ nodes: [{ data: { productIds: [removable.id] } }] }),
    ]);
    await assert.rejects(service.removeProduct(a, String(removable.id)), /Product is used/);
    await pg.query('DELETE FROM flow_versions WHERE tenant_id=$1', [a]);
    await pg.query('INSERT INTO flow_sessions(tenant_id,state) VALUES($1,$2::jsonb)', [
      a, JSON.stringify({ currentProduct: removable.id }),
    ]);
    await assert.rejects(service.removeProduct(a, String(removable.id)), /Product is used/);
    await pg.query('DELETE FROM flow_sessions WHERE tenant_id=$1', [a]);
    const archived = await service.archiveProduct(a, String(removable.id));
    assert.equal(archived.archived, true);
    assert.deepEqual(await service.removeProduct(a, String(removable.id)), {
      deleted: true,
      id: removable.id,
    });
    assert.equal((await service.products(a)).some((item) => item.id === removable.id), false);
    await pg.query(
      `INSERT INTO catalog_products (tenant_id, category_id, sku, name, price_cents, currency, archived)
       SELECT $1,$2,'LOAD-' || lpad(n::text,4,'0'),'Fixture ' || lpad(n::text,4,'0'),1000,'EGP',n % 2 = 0
       FROM generate_series(1,1005) n`,
      [a, child.id],
    );
    assert.equal((await service.products(a)).length, 500, 'legacy array contract');
    const lastPage = await service.productPage(a, root.id, 'fixture', 101);
    assert.equal(lastPage.total, 1005);
    assert.equal(lastPage.page, 101);
    assert.deepEqual(lastPage.rows.map((row: { sku: string }) => row.sku), [
      'LOAD-1001', 'LOAD-1002', 'LOAD-1003', 'LOAD-1004', 'LOAD-1005',
    ]);
    assert.equal((await service.productPage(a, root.id, 'LOAD-1005', 1)).rows[0].sku, 'LOAD-1005');
    assert.equal((await service.productPage(a, root.id, 'LOAD-1005', 82)).page, 1);
    assert.equal((await service.productPage(b, 'all', 'LOAD-', 1)).total, 0);
    assert.equal((await service.productScope(a)).find((row) => row.category_id === child.id).count, 1005);
  } finally {
    await pg.close();
  }
});
