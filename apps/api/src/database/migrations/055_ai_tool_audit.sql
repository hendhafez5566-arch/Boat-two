ALTER TABLE ai_runs ADD COLUMN provider_id uuid REFERENCES ai_providers(id) ON DELETE SET NULL;
ALTER TABLE ai_runs ADD COLUMN input_rate_microusd bigint;
ALTER TABLE ai_runs ADD COLUMN output_rate_microusd bigint;
CREATE TABLE ai_tool_audits(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),run_id uuid NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
 agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,tool_index integer NOT NULL,tool_name text NOT NULL,input_hash text NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('applied','noop','denied','invalid','limit','failed')),resource_id uuid,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(run_id,tool_index)
);
ALTER TABLE ai_tool_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_tool_audits FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_tool_audits USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT ON ai_tool_audits TO app_user;
CREATE INDEX ai_tool_audits_history ON ai_tool_audits(tenant_id,created_at DESC,id);
