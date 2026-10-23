ALTER TABLE ai_providers DROP CONSTRAINT ai_providers_kind_check;
ALTER TABLE ai_providers ADD CONSTRAINT ai_providers_kind_check CHECK(kind IN ('anthropic','openai'));
ALTER TABLE ai_providers ADD COLUMN key_version int NOT NULL DEFAULT 1;
ALTER TABLE ai_providers ADD COLUMN key_rotated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE channels ADD CONSTRAINT channels_tenant_id_unique UNIQUE(tenant_id,id);
ALTER TABLE flows ADD CONSTRAINT flows_tenant_id_unique UNIQUE(tenant_id,id);
ALTER TABLE ai_agents ADD CONSTRAINT ai_agents_tenant_id_unique UNIQUE(tenant_id,id);
CREATE TABLE ai_routes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),
 agent_id uuid NOT NULL,channel_id uuid,flow_id uuid,
 FOREIGN KEY(tenant_id,agent_id) REFERENCES ai_agents(tenant_id,id),
 CHECK((channel_id IS NULL)<>(flow_id IS NULL)),
 FOREIGN KEY(tenant_id,channel_id) REFERENCES channels(tenant_id,id),
 FOREIGN KEY(tenant_id,flow_id) REFERENCES flows(tenant_id,id)
);
CREATE UNIQUE INDEX ai_route_channel_idx ON ai_routes(tenant_id,channel_id) WHERE channel_id IS NOT NULL;
CREATE UNIQUE INDEX ai_route_flow_idx ON ai_routes(tenant_id,flow_id) WHERE flow_id IS NOT NULL;
ALTER TABLE ai_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_routes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_routes USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON ai_routes TO app_user;
CREATE TRIGGER audit_ai_routes AFTER INSERT OR UPDATE OR DELETE ON ai_routes FOR EACH ROW EXECUTE FUNCTION audit_core_change();
CREATE TRIGGER audit_ai_providers AFTER INSERT OR UPDATE ON ai_providers FOR EACH ROW EXECUTE FUNCTION audit_core_change();
