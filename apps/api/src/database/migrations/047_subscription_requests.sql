CREATE TABLE billing_subscription_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),
 requested_by uuid NOT NULL REFERENCES users(id),kind text NOT NULL CHECK(kind IN ('cancel','resume','change_plan')),
 plan_code text,price_id text,expected_price_id text,customer_id text NOT NULL,subscription_id text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','blocked','completed','failed','ambiguous','canceled')),
 error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((kind='change_plan' AND plan_code IS NOT NULL AND price_id IS NOT NULL) OR (kind<>'change_plan' AND plan_code IS NULL AND price_id IS NULL))
);
ALTER TABLE billing_subscription_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_subscription_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON billing_subscription_requests USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON billing_subscription_requests TO app_user;
CREATE UNIQUE INDEX billing_one_unresolved_request ON billing_subscription_requests(tenant_id) WHERE status IN ('pending','ambiguous');
CREATE INDEX billing_requests_history ON billing_subscription_requests(tenant_id,created_at DESC,id);
CREATE TRIGGER audit_core AFTER INSERT OR UPDATE ON billing_subscription_requests FOR EACH ROW EXECUTE FUNCTION audit_core_change();
