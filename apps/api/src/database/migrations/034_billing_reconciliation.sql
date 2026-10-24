CREATE TABLE billing_reconciliations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','blocked','completed','failed')),error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE billing_reconciliations ENABLE ROW LEVEL SECURITY;ALTER TABLE billing_reconciliations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON billing_reconciliations USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON billing_reconciliations TO app_user;
CREATE UNIQUE INDEX billing_one_pending_reconciliation ON billing_reconciliations(tenant_id) WHERE status='pending';
