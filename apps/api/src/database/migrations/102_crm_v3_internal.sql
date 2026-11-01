-- Additive, tenant-isolated internal notifications. No outbound delivery.
CREATE TABLE crm_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 user_id uuid NOT NULL REFERENCES users(id),
 kind text NOT NULL,
 resource_type text NOT NULL CHECK(resource_type IN ('contact','deal','task','conversation')),
 resource_id uuid NOT NULL,
 contact_id uuid,
 title text NOT NULL CHECK(length(title)<=200),
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','high')),
 dedupe_key text NOT NULL,
 read_at timestamptz,
 handled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,user_id,dedupe_key),
 FOREIGN KEY(tenant_id,user_id) REFERENCES memberships(tenant_id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id)
);
ALTER TABLE crm_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm_notifications USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON crm_notifications TO app_user;
CREATE INDEX crm_notifications_user_idx ON crm_notifications(tenant_id,user_id,created_at DESC);
-- Execution receipts also protect direct follow-up deliveries and overlapping workers.
CREATE TABLE automation_action_receipts (
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 execution_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,execution_key)
);
ALTER TABLE automation_action_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_action_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON automation_action_receipts USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT ON automation_action_receipts TO app_user;
CREATE FUNCTION crm_v3_owner_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(OLD)->>'owner_id') IS DISTINCT FROM (to_jsonb(NEW)->>'owner_id') OR
    (to_jsonb(OLD)->>'assigned_to') IS DISTINCT FROM (to_jsonb(NEW)->>'assigned_to') THEN
  INSERT INTO audit_logs(tenant_id,actor_id,action,resource_type,resource_id,details)
  VALUES(NEW.tenant_id,NULLIF(current_setting('app.actor_id',true),'')::uuid,'owner_changed',TG_TABLE_NAME,NEW.id::text,
  jsonb_build_object('from',COALESCE(to_jsonb(OLD)->>'owner_id',to_jsonb(OLD)->>'assigned_to'),'to',COALESCE(to_jsonb(NEW)->>'owner_id',to_jsonb(NEW)->>'assigned_to')));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_contact_owner_history AFTER UPDATE OF owner_id ON contacts FOR EACH ROW EXECUTE FUNCTION crm_v3_owner_history();
CREATE TRIGGER crm_deal_owner_history AFTER UPDATE OF owner_id ON crm_deals FOR EACH ROW EXECUTE FUNCTION crm_v3_owner_history();
CREATE TRIGGER crm_conversation_owner_history AFTER UPDATE OF assigned_to ON conversations FOR EACH ROW EXECUTE FUNCTION crm_v3_owner_history();
