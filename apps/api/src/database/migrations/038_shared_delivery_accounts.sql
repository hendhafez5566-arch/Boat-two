CREATE TABLE delivery_accounts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),name text NOT NULL,
 provider text NOT NULL CHECK(provider IN ('meta','web')),interval_ms int NOT NULL CHECK(interval_ms BETWEEN 100 AND 3600000),
 daily_limit int NOT NULL CHECK(daily_limit=-1 OR daily_limit BETWEEN 1 AND 100000000),daily_used int NOT NULL DEFAULT 0 CHECK(daily_used>=0),
 usage_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,next_send_at timestamptz NOT NULL DEFAULT now(),enabled boolean NOT NULL DEFAULT true,UNIQUE(tenant_id,id)
);
ALTER TABLE delivery_accounts ENABLE ROW LEVEL SECURITY;ALTER TABLE delivery_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON delivery_accounts USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON delivery_accounts TO app_user;
ALTER TABLE channel_delivery_policy ADD COLUMN account_id uuid;
ALTER TABLE channel_delivery_policy ADD CONSTRAINT delivery_account_tenant_fk FOREIGN KEY(tenant_id,account_id) REFERENCES delivery_accounts(tenant_id,id);
CREATE TRIGGER audit_delivery_accounts AFTER INSERT OR UPDATE OF name,interval_ms,daily_limit,enabled ON delivery_accounts FOR EACH ROW EXECUTE FUNCTION audit_core_change();
