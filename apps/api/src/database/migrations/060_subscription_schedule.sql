ALTER TABLE billing_subscription_requests ADD COLUMN execute_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX billing_scheduled_requests ON billing_subscription_requests(tenant_id,execute_at) WHERE status='pending';
