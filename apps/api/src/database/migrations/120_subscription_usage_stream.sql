-- Publish committed counter changes through the existing durable tenant stream.
CREATE FUNCTION record_subscription_usage_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE workspace_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    workspace_id := OLD.tenant_id;
  ELSE
    workspace_id := NEW.tenant_id;
  END IF;
  IF NOT EXISTS (SELECT FROM tenants WHERE id = workspace_id) THEN RETURN NULL; END IF;
  INSERT INTO realtime_events(tenant_id, payload)
  VALUES (workspace_id, '{"type":"usage_changed"}'::jsonb);
  RETURN NULL;
END;
$$;

CREATE TRIGGER contact_subscription_usage
AFTER INSERT OR DELETE ON contacts FOR EACH ROW EXECUTE FUNCTION record_subscription_usage_change();

CREATE TRIGGER generation_subscription_usage
AFTER INSERT OR UPDATE OR DELETE ON generation_usage
FOR EACH ROW EXECUTE FUNCTION record_subscription_usage_change();

CREATE TRIGGER generation_policy_subscription_usage
AFTER INSERT OR UPDATE OR DELETE ON generation_policy
FOR EACH ROW EXECUTE FUNCTION record_subscription_usage_change();

CREATE TRIGGER billing_subscription_usage
AFTER INSERT OR UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION record_subscription_usage_change();

CREATE TABLE held_inbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  contact_external_id text NOT NULL,
  contact_name text,
  external_message_id text,
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, external_message_id)
);
CREATE INDEX held_inbound_messages_tenant_idx ON held_inbound_messages(tenant_id);
ALTER TABLE held_inbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE held_inbound_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON held_inbound_messages
  USING (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT, INSERT, DELETE ON held_inbound_messages TO app_user;
CREATE TRIGGER held_inbound_subscription_usage
AFTER INSERT OR DELETE ON held_inbound_messages
FOR EACH ROW EXECUTE FUNCTION record_subscription_usage_change();
