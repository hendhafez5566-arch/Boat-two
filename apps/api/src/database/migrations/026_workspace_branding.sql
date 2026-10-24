CREATE TABLE workspace_branding(
 tenant_id uuid PRIMARY KEY REFERENCES tenants(id),name text NOT NULL,logo_url text,primary_color text NOT NULL DEFAULT '#0f766e',
 widget_title text NOT NULL DEFAULT 'Chat with us',updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE workspace_domains(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),hostname text NOT NULL UNIQUE,
 verification_token text NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','revoked')),
 verified_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['workspace_branding','workspace_domains'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO app_user',t);
 EXECUTE format('CREATE TRIGGER audit_branding AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION audit_core_change()',t);
 END LOOP; END $$;
