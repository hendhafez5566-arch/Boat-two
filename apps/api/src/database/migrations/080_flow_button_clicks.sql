-- Per-button click tracking: one row each time a contact taps a button/list row of a waiting flow step.
CREATE TABLE flow_button_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL,
  node_id text NOT NULL,
  option_id text NOT NULL,
  contact_id uuid NOT NULL,
  conversation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX flow_button_clicks_flow_idx ON flow_button_clicks (tenant_id, flow_id, node_id, option_id);

ALTER TABLE flow_button_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_button_clicks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON flow_button_clicks
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON flow_button_clicks TO app_user;
