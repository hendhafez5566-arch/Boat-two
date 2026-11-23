ALTER TABLE catalog_products ADD COLUMN checkout jsonb NOT NULL DEFAULT '{}';
CREATE TABLE commerce_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL,
  request_id uuid NOT NULL,
  request jsonb NOT NULL,
  snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','confirmed','completed','cancelled')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, contact_id) REFERENCES contacts(tenant_id,id) ON DELETE CASCADE,
  UNIQUE (tenant_id, request_id),
  UNIQUE (tenant_id, id)
);
CREATE INDEX commerce_orders_recent ON commerce_orders (tenant_id, created_at DESC, id DESC);
ALTER TABLE commerce_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY commerce_orders_tenant ON commerce_orders USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE(status) ON commerce_orders TO app_user;

CREATE TABLE commerce_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('new','confirmed','completed','cancelled')),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, order_id) REFERENCES commerce_orders(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX commerce_order_events_history ON commerce_order_events (tenant_id, order_id, created_at, id);
ALTER TABLE commerce_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_order_events FORCE ROW LEVEL SECURITY;
CREATE POLICY commerce_order_events_tenant ON commerce_order_events
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON commerce_order_events TO app_user;
