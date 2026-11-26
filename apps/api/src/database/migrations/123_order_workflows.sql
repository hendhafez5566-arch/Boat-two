CREATE TABLE order_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  stages jsonb NOT NULL,
  archived_at timestamptz
);
ALTER TABLE order_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_workflows FORCE ROW LEVEL SECURITY;
CREATE POLICY order_workflows_tenant ON order_workflows
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON order_workflows TO app_user;

ALTER TABLE crm_tasks
  ADD COLUMN workflow_order_id uuid,
  ADD FOREIGN KEY (tenant_id, workflow_order_id) REFERENCES commerce_orders(tenant_id, id) ON DELETE CASCADE,
  ADD COLUMN order_workflow jsonb;
CREATE UNIQUE INDEX crm_tasks_workflow_order ON crm_tasks(tenant_id, workflow_order_id)
  WHERE workflow_order_id IS NOT NULL;
