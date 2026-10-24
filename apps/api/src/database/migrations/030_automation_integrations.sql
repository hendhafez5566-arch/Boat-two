CREATE TABLE integration_secrets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),name text NOT NULL,
 value_enc text NOT NULL,allowed_hosts text[] NOT NULL,version int NOT NULL DEFAULT 1,enabled boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE automation_failures(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),rule_id uuid NOT NULL,event_id uuid NOT NULL,contact_id uuid NOT NULL,
 error text NOT NULL,attempts int NOT NULL DEFAULT 1,resolved_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,rule_id,event_id)
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['integration_secrets','automation_failures'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO app_user',t);
 END LOOP; END $$;
CREATE TRIGGER audit_integration_secret AFTER INSERT OR UPDATE ON integration_secrets FOR EACH ROW EXECUTE FUNCTION audit_core_change();
