ALTER TABLE tenants ADD COLUMN settings jsonb NOT NULL DEFAULT '{}';
ALTER TABLE tenants ADD COLUMN onboarding_completed_at timestamptz;
ALTER TABLE tenants ADD COLUMN preferred_plan text NOT NULL DEFAULT 'pro' CHECK (preferred_plan IN ('free','starter','pro','business'));

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_tenant_date_idx ON audit_logs(tenant_id, created_at DESC, id DESC);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_logs USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON audit_logs TO app_user;
GRANT USAGE, SELECT ON SEQUENCE audit_logs_id_seq TO app_user;

-- Audit metadata only: never record channel credentials, invitation hashes or message bodies.
CREATE FUNCTION audit_core_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r jsonb; tid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN r = to_jsonb(OLD); ELSE r = to_jsonb(NEW); END IF;
  tid = CASE WHEN TG_TABLE_NAME = 'tenants' THEN (r->>'id')::uuid ELSE (r->>'tenant_id')::uuid END;
  INSERT INTO audit_logs(tenant_id, actor_id, action, resource_type, resource_id)
  VALUES(tid, NULLIF(current_setting('app.actor_id', true), '')::uuid, lower(TG_OP), TG_TABLE_NAME, r->>'id');
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['tenants','memberships','invitations','channels','flows','flow_versions','inbox_settings','canned_replies'] LOOP
    EXECUTE format('CREATE TRIGGER audit_core AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_core_change()', t);
  END LOOP;
END $$;
