CREATE TABLE integration_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 provider text NOT NULL, name text NOT NULL, credentials_enc text, config jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','connected','needs_action','disconnected')),
 enabled boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id)
);
CREATE TABLE integration_oauth_states (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id), state_hash text UNIQUE NOT NULL, scopes text[] NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes', consumed boolean NOT NULL DEFAULT false
);
CREATE TABLE integration_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 connection_id uuid NOT NULL,event_key text NOT NULL,payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sending','completed','failed','ambiguous')),
 attempts int NOT NULL DEFAULT 0,error text,available_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,connection_id) REFERENCES integration_connections(tenant_id,id) ON DELETE CASCADE,
 UNIQUE(tenant_id,connection_id,event_key)
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['integration_connections','integration_oauth_states','integration_deliveries'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO app_user',t);END LOOP;END $$;
CREATE FUNCTION integration_oauth_lookup(p_hash text) RETURNS TABLE(id uuid,tenant_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT id,tenant_id FROM integration_oauth_states WHERE state_hash=p_hash AND NOT consumed AND expires_at>now() $$;
REVOKE ALL ON FUNCTION integration_oauth_lookup(text) FROM PUBLIC;GRANT EXECUTE ON FUNCTION integration_oauth_lookup(text) TO app_user;
CREATE FUNCTION integration_due(p_limit int) RETURNS TABLE(id uuid,tenant_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT j.id,j.tenant_id FROM integration_deliveries j JOIN integration_connections c ON c.id=j.connection_id AND c.enabled WHERE ((j.status='pending' AND j.available_at<=now()) OR (j.status='sending' AND j.lease_until<now())) ORDER BY j.created_at LIMIT LEAST(p_limit,100) $$;
REVOKE ALL ON FUNCTION integration_due(int) FROM PUBLIC;GRANT EXECUTE ON FUNCTION integration_due(int) TO app_user;
CREATE INDEX integration_delivery_due ON integration_deliveries(status,available_at);
-- Durable event production in the same transaction as the source change.
CREATE FUNCTION integration_source_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='messages' THEN
  IF TG_OP='INSERT' AND NEW.direction='out' AND NOT NEW.is_internal THEN
   INSERT INTO domain_events(tenant_id,type,aggregate_id,payload,dedupe_key) VALUES(NEW.tenant_id,'message.outbound',NEW.conversation_id::text,jsonb_build_object('messageId',NEW.id,'conversationId',NEW.conversation_id,'channelId',NEW.channel_id,'status',NEW.status,'content',NEW.content),'outbound:'||NEW.id);
  ELSIF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
   INSERT INTO domain_events(tenant_id,type,aggregate_id,payload,dedupe_key) VALUES(NEW.tenant_id,'message.status',NEW.conversation_id::text,jsonb_build_object('messageId',NEW.id,'conversationId',NEW.conversation_id,'status',NEW.status),'status:'||NEW.id||':'||NEW.status) ON CONFLICT(tenant_id,dedupe_key) DO NOTHING;
  END IF;
 ELSE
  IF ROW(NEW.status,NEW.handled_by,NEW.assigned_to,NEW.department_id) IS DISTINCT FROM ROW(OLD.status,OLD.handled_by,OLD.assigned_to,OLD.department_id) THEN
   INSERT INTO domain_events(tenant_id,type,aggregate_id,payload,dedupe_key) VALUES(NEW.tenant_id,'conversation.updated',NEW.id::text,jsonb_build_object('conversationId',NEW.id,'contactId',NEW.contact_id,'status',NEW.status,'handledBy',NEW.handled_by,'assignedTo',NEW.assigned_to,'departmentId',NEW.department_id),gen_random_uuid()::text);
  END IF;
 END IF;RETURN NEW;END $$;
CREATE TRIGGER integration_message_insert AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION integration_source_event();
CREATE TRIGGER integration_message_status AFTER UPDATE OF status ON messages FOR EACH ROW EXECUTE FUNCTION integration_source_event();
CREATE TRIGGER integration_conversation_update AFTER UPDATE OF status,handled_by,assigned_to,department_id ON conversations FOR EACH ROW EXECUTE FUNCTION integration_source_event();
CREATE TRIGGER audit_integration_connection AFTER INSERT OR UPDATE ON integration_connections FOR EACH ROW EXECUTE FUNCTION audit_core_change();
