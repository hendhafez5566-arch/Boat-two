CREATE TABLE generation_policy(
 tenant_id uuid PRIMARY KEY REFERENCES tenants(id),revision integer NOT NULL DEFAULT 1,
 monthly_calls integer CHECK(monthly_calls>=0),monthly_tokens bigint CHECK(monthly_tokens>=0),monthly_cost_microusd bigint CHECK(monthly_cost_microusd>=0)
);
CREATE TABLE generation_usage(
 tenant_id uuid NOT NULL REFERENCES tenants(id),period date NOT NULL,
 baseline_calls integer NOT NULL DEFAULT 0,baseline_unpriced_calls integer NOT NULL DEFAULT 0,attempts integer NOT NULL DEFAULT 0,
 reserved_tokens bigint NOT NULL DEFAULT 0 CHECK(reserved_tokens>=0),charged_tokens bigint NOT NULL DEFAULT 0 CHECK(charged_tokens>=0),
 reserved_cost_microusd bigint NOT NULL DEFAULT 0 CHECK(reserved_cost_microusd>=0),charged_cost_microusd bigint NOT NULL DEFAULT 0 CHECK(charged_cost_microusd>=0),
 PRIMARY KEY(tenant_id,period)
);
CREATE TABLE generation_reservations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),effect_key text NOT NULL,request_hash text NOT NULL,
 period date NOT NULL,model_version_id uuid,model text NOT NULL,provider_id uuid,
 input_rate_microusd bigint,output_rate_microusd bigint,reserved_tokens bigint NOT NULL,reserved_cost_microusd bigint,
 actual_input_tokens bigint,actual_output_tokens bigint,actual_cost_microusd bigint,
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','started','uncertain','settled','released')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES users(id),evidence text,
 UNIQUE(tenant_id,effect_key),FOREIGN KEY(tenant_id,model_version_id) REFERENCES ai_model_versions(tenant_id,id),
 FOREIGN KEY(tenant_id,provider_id) REFERENCES ai_providers(tenant_id,id)
);
CREATE INDEX generation_reservations_review_idx ON generation_reservations(tenant_id,status,created_at DESC);
ALTER TABLE ai_runs ADD COLUMN generation_reservation_id uuid REFERENCES generation_reservations(id);
CREATE UNIQUE INDEX ai_runs_generation_unique ON ai_runs(generation_reservation_id) WHERE generation_reservation_id IS NOT NULL;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['generation_policy','generation_usage','generation_reservations'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO app_user',t);
 END LOOP;
END $$;
CREATE TRIGGER audit_generation_policy AFTER INSERT OR UPDATE ON generation_policy FOR EACH ROW EXECUTE FUNCTION audit_core_change();
