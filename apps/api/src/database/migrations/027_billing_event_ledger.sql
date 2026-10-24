ALTER TABLE subscriptions ADD COLUMN stripe_event_created bigint NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN stripe_event_id text;
CREATE TABLE billing_events(
 id text PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES tenants(id),type text NOT NULL,provider_created bigint NOT NULL,
 status text NOT NULL CHECK(status IN ('processed','ignored')),reason text,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON billing_events USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON billing_events TO app_user;
CREATE INDEX billing_events_tenant_date_idx ON billing_events(tenant_id,created_at DESC);
-- Called only after a verified provider signature; returns routing metadata, never billing secrets.
CREATE FUNCTION billing_customer_tenant(customer text) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT tenant_id FROM subscriptions WHERE stripe_customer_id=customer LIMIT 1
$$;
REVOKE ALL ON FUNCTION billing_customer_tenant(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing_customer_tenant(text) TO app_user;
