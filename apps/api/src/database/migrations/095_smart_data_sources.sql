CREATE TABLE catalog_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),name text NOT NULL,kind text NOT NULL CHECK(kind IN('file','google')),
 connection_id uuid,spreadsheet_id text,sheet_range text,mapping jsonb NOT NULL,auto_sync boolean NOT NULL DEFAULT false,ai_enabled boolean NOT NULL DEFAULT false,
 revision int NOT NULL DEFAULT 0,last_success_at timestamptz,last_attempt_at timestamptz,last_error text,next_sync_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,connection_id) REFERENCES integration_connections(tenant_id,id),CHECK(kind='google' OR NOT auto_sync)
);
ALTER TABLE catalog_products ADD COLUMN source_id uuid,ADD COLUMN external_key text,ADD COLUMN category_path text NOT NULL DEFAULT '',ADD COLUMN sort_order numeric NOT NULL DEFAULT 0,ADD COLUMN category_sort numeric NOT NULL DEFAULT 0,ADD COLUMN dynamic_fields jsonb NOT NULL DEFAULT '[]';
ALTER TABLE catalog_products ADD CONSTRAINT catalog_source_tenant_fk FOREIGN KEY(tenant_id,source_id) REFERENCES catalog_sources(tenant_id,id);
CREATE UNIQUE INDEX catalog_source_key ON catalog_products(tenant_id,source_id,external_key) WHERE source_id IS NOT NULL;
CREATE INDEX catalog_dynamic_page ON catalog_products(tenant_id,source_id,category_path,sort_order,id) WHERE NOT archived;
CREATE TABLE catalog_sync_previews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,source_id uuid NOT NULL,revision int NOT NULL,items jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(tenant_id,source_id) REFERENCES catalog_sources(tenant_id,id));
CREATE TABLE catalog_sync_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,source_id uuid NOT NULL,status text NOT NULL,item_count int NOT NULL DEFAULT 0,error text,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(tenant_id,source_id) REFERENCES catalog_sources(tenant_id,id));
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['catalog_sources','catalog_sync_previews','catalog_sync_runs'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO app_user',t);
 END LOOP;END $$;
CREATE FUNCTION catalog_sources_due() RETURNS TABLE(id uuid,tenant_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT id,tenant_id FROM catalog_sources WHERE kind='google' AND auto_sync AND next_sync_at<=now() ORDER BY next_sync_at LIMIT 5 $$;
REVOKE ALL ON FUNCTION catalog_sources_due() FROM PUBLIC;GRANT EXECUTE ON FUNCTION catalog_sources_due() TO app_user;
