CREATE TABLE whatsapp_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,name text NOT NULL,language text NOT NULL,category text NOT NULL CHECK(category IN ('MARKETING','UTILITY','AUTHENTICATION')),body text NOT NULL,examples jsonb NOT NULL DEFAULT '[]',status text NOT NULL DEFAULT 'DRAFT',provider_id text,error text,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(channel_id,name,language));
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;ALTER TABLE whatsapp_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON whatsapp_templates USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON whatsapp_templates TO app_user;
ALTER TABLE domain_events ADD COLUMN root_id uuid;
UPDATE domain_events SET root_id=id;
ALTER TABLE domain_events ALTER COLUMN root_id SET NOT NULL;
CREATE FUNCTION event_causality() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 NEW.root_id=COALESCE(NULLIF(current_setting('app.root_event_id',true),'')::uuid,NEW.id);RETURN NEW;END $$;
CREATE TRIGGER domain_causality BEFORE INSERT ON domain_events FOR EACH ROW EXECUTE FUNCTION event_causality();
ALTER TABLE automation_runs ADD COLUMN root_id uuid;
ALTER TABLE automation_runs ADD COLUMN contact_id uuid;
CREATE UNIQUE INDEX automation_once_per_chain ON automation_runs(rule_id,root_id,contact_id);
