CREATE TABLE domain_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), seq bigserial NOT NULL,
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 type text NOT NULL, aggregate_id text NOT NULL, dedupe_key text NOT NULL,
 payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','failed')),
 attempts int NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), error text,
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 UNIQUE(tenant_id,dedupe_key)
);
CREATE INDEX domain_events_due_idx ON domain_events(available_at,seq) WHERE status='pending';
CREATE TABLE outbound_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 message_id uuid NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','ambiguous','blocked')),
 attempts int NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz,
 error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbound_jobs_due_idx ON outbound_jobs(available_at) WHERE status='pending';
ALTER TABLE messages ADD COLUMN effect_key text;
CREATE UNIQUE INDEX messages_effect_key_idx ON messages(tenant_id,effect_key) WHERE effect_key IS NOT NULL;
CREATE TABLE realtime_events (
 id bigserial PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX realtime_events_tenant_cursor_idx ON realtime_events(tenant_id,id);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['domain_events','outbound_jobs','realtime_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO app_user',t);
 END LOOP;
END $$;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
CREATE FUNCTION event_due(p_limit int) RETURNS TABLE(id uuid,tenant_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT e.id,e.tenant_id FROM domain_events e WHERE status='pending' AND available_at<=now() ORDER BY seq LIMIT LEAST(GREATEST(p_limit,1),100)
$$;
CREATE FUNCTION outbound_due(p_limit int) RETURNS TABLE(id uuid,tenant_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT j.id,j.tenant_id FROM outbound_jobs j WHERE (status='pending' AND available_at<=now()) OR (status='sending' AND lease_until<now()) ORDER BY available_at LIMIT LEAST(GREATEST(p_limit,1),100)
$$;
REVOKE ALL ON FUNCTION event_due(int),outbound_due(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION event_due(int),outbound_due(int) TO app_user;
CREATE FUNCTION record_realtime_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE data jsonb;
BEGIN
 IF TG_TABLE_NAME='messages' THEN
  IF TG_OP='INSERT' THEN data=jsonb_build_object('type','message','conversationId',NEW.conversation_id,'message',jsonb_build_object('id',NEW.id,'seq',NEW.seq,'direction',NEW.direction,'senderType',NEW.sender_type,'senderUserId',NEW.sender_user_id,'type',NEW.type,'content',NEW.content,'status',NEW.status,'isInternal',NEW.is_internal,'createdAt',NEW.created_at));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN data=jsonb_build_object('type','message_status','conversationId',NEW.conversation_id,'messageId',NEW.id,'status',NEW.status,'error',NEW.error);
  ELSE RETURN NEW; END IF;
 ELSE data=jsonb_build_object('type','conversation','conversationId',NEW.id,'reason','updated'); END IF;
 INSERT INTO realtime_events(tenant_id,payload) VALUES(NEW.tenant_id,data);
 RETURN NEW;
END $$;
CREATE TRIGGER message_realtime AFTER INSERT OR UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION record_realtime_change();
CREATE TRIGGER conversation_realtime AFTER INSERT OR UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION record_realtime_change();
