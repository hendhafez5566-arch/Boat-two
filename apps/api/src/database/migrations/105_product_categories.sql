-- Local organization only; intentionally separate from provider catalog identifiers.
CREATE TABLE product_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,name)
);
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON product_categories
 USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON product_categories TO app_user;
ALTER TABLE catalog_products ADD COLUMN category_id uuid;
ALTER TABLE catalog_products ADD CONSTRAINT product_local_category
 FOREIGN KEY(tenant_id,category_id) REFERENCES product_categories(tenant_id,id);
CREATE INDEX catalog_product_category ON catalog_products(tenant_id,category_id);
