CREATE TABLE channel_delivery_policy(
 tenant_id uuid NOT NULL REFERENCES tenants(id),channel_id uuid PRIMARY KEY REFERENCES channels(id),
 interval_ms int NOT NULL DEFAULT 1000 CHECK(interval_ms BETWEEN 100 AND 3600000),
 marketing_enabled boolean NOT NULL DEFAULT false,next_send_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE channel_delivery_policy ENABLE ROW LEVEL SECURITY;ALTER TABLE channel_delivery_policy FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON channel_delivery_policy USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON channel_delivery_policy TO app_user;
CREATE TRIGGER audit_delivery_policy AFTER INSERT OR UPDATE ON channel_delivery_policy FOR EACH ROW EXECUTE FUNCTION audit_core_change();
