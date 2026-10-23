ALTER TABLE ai_providers ADD COLUMN context_token_limit integer NOT NULL DEFAULT 32000 CHECK(context_token_limit BETWEEN 1024 AND 2000000);
ALTER TABLE ai_providers ADD COLUMN max_output_tokens integer NOT NULL DEFAULT 600 CHECK(max_output_tokens BETWEEN 1 AND 64000);
ALTER TABLE ai_providers ADD CONSTRAINT ai_provider_context_output CHECK(max_output_tokens<context_token_limit);
CREATE TABLE ai_model_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),provider_id uuid NOT NULL,
 revision integer NOT NULL,kind text NOT NULL,model text NOT NULL,supports_tools boolean NOT NULL,
 context_token_limit integer NOT NULL,max_output_tokens integer NOT NULL,
 input_rate_microusd bigint,output_rate_microusd bigint,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider_id,revision),UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,provider_id) REFERENCES ai_providers(tenant_id,id)
);
ALTER TABLE ai_model_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_model_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_model_versions USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT ON ai_model_versions TO app_user;
INSERT INTO ai_model_versions(tenant_id,provider_id,revision,kind,model,supports_tools,context_token_limit,max_output_tokens,input_rate_microusd,output_rate_microusd)
 SELECT tenant_id,id,revision,kind,model,supports_tools,context_token_limit,max_output_tokens,input_microusd_per_million,output_microusd_per_million FROM ai_providers;
CREATE FUNCTION capture_ai_model_version() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND ROW(NEW.kind,NEW.model,NEW.supports_tools,NEW.context_token_limit,NEW.max_output_tokens,NEW.input_microusd_per_million,NEW.output_microusd_per_million)
 IS NOT DISTINCT FROM ROW(OLD.kind,OLD.model,OLD.supports_tools,OLD.context_token_limit,OLD.max_output_tokens,OLD.input_microusd_per_million,OLD.output_microusd_per_million) THEN RETURN NEW; END IF;
 INSERT INTO ai_model_versions(tenant_id,provider_id,revision,kind,model,supports_tools,context_token_limit,max_output_tokens,input_rate_microusd,output_rate_microusd)
 VALUES(NEW.tenant_id,NEW.id,NEW.revision,NEW.kind,NEW.model,NEW.supports_tools,NEW.context_token_limit,NEW.max_output_tokens,NEW.input_microusd_per_million,NEW.output_microusd_per_million);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION capture_ai_model_version() FROM PUBLIC;
CREATE TRIGGER capture_ai_model_version AFTER INSERT OR UPDATE ON ai_providers FOR EACH ROW EXECUTE FUNCTION capture_ai_model_version();
