CREATE TABLE crm_create_receipts (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL,
  fingerprint text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('contacts', 'deals', 'tasks')),
  entity_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, actor_id, kind, request_id)
);
ALTER TABLE crm_create_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_create_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm_create_receipts
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON crm_create_receipts TO app_user;

ALTER TABLE conversations ADD COLUMN crm_initiated boolean NOT NULL DEFAULT false;
