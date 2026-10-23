ALTER TABLE subscriptions ADD COLUMN cancel_at_period_end boolean NOT NULL DEFAULT false;
CREATE TABLE billing_invoices(
 provider_id text PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES tenants(id),number text,status text NOT NULL CHECK(status IN ('draft','open','paid','void','uncollectible','deleted')),
 currency text NOT NULL,amount_due bigint NOT NULL,amount_paid bigint NOT NULL,amount_remaining bigint NOT NULL,
 attempted_count int NOT NULL DEFAULT 0,payment_failed boolean NOT NULL DEFAULT false,hosted_url text,pdf_url text,due_at timestamptz,
 provider_created bigint NOT NULL,event_created bigint NOT NULL,event_rank int NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON billing_invoices USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON billing_invoices TO app_user;
CREATE INDEX billing_invoices_tenant_date_idx ON billing_invoices(tenant_id,provider_created DESC,provider_id);
