ALTER TABLE contacts ADD COLUMN lifecycle text NOT NULL DEFAULT 'lead' CHECK(lifecycle IN ('lead','qualified','customer','inactive'));
ALTER TABLE contacts ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE contacts ADD COLUMN owner_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE contacts ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE contacts ADD CONSTRAINT contacts_tenant_id_unique UNIQUE(tenant_id,id);
CREATE INDEX contacts_email_search_idx ON contacts(tenant_id,lower(email));
CREATE INDEX contacts_phone_search_idx ON contacts(tenant_id,phone);
CREATE INDEX contacts_tags_idx ON contacts USING gin(tags);
CREATE TABLE crm_fields(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,key text NOT NULL,label text NOT NULL,type text NOT NULL CHECK(type IN ('text','number','date','boolean')),UNIQUE(tenant_id,key));
CREATE TABLE crm_segments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,name text NOT NULL,filters jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE crm_notes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,contact_id uuid NOT NULL,body text NOT NULL,created_by uuid REFERENCES users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id) ON DELETE CASCADE);
CREATE TABLE crm_pipelines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,name text NOT NULL,stages jsonb NOT NULL,UNIQUE(tenant_id,id));
CREATE TABLE crm_deals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,contact_id uuid NOT NULL,pipeline_id uuid NOT NULL,title text NOT NULL,stage text NOT NULL,value_cents bigint NOT NULL DEFAULT 0 CHECK(value_cents>=0),currency text NOT NULL DEFAULT 'USD',status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','won','lost')),updated_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id) ON DELETE CASCADE,FOREIGN KEY(tenant_id,pipeline_id) REFERENCES crm_pipelines(tenant_id,id));
CREATE TABLE crm_tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,contact_id uuid NOT NULL,title text NOT NULL,due_at timestamptz NOT NULL,assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','done')),created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id) ON DELETE CASCADE);
CREATE INDEX crm_tasks_due_idx ON crm_tasks(tenant_id,status,due_at);
CREATE TABLE contact_consents(tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,contact_id uuid NOT NULL,channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,status text NOT NULL CHECK(status IN ('opted_in','opted_out')),evidence text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,contact_id,channel_id),FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id) ON DELETE CASCADE);
CREATE TABLE consent_history(id bigserial PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,contact_id uuid NOT NULL,channel_id uuid NOT NULL,status text NOT NULL,evidence text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE campaigns(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,name text NOT NULL,channel_id uuid NOT NULL REFERENCES channels(id),filters jsonb NOT NULL DEFAULT '{}',content jsonb NOT NULL,status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','running','completed','canceled')),scheduled_at timestamptz,frequency_hours int NOT NULL DEFAULT 24 CHECK(frequency_hours BETWEEN 1 AND 720),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id));
CREATE TABLE campaign_recipients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,campaign_id uuid NOT NULL,contact_id uuid NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','queued','skipped','failed')),message_id uuid REFERENCES messages(id) ON DELETE SET NULL,error text,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(campaign_id,contact_id),FOREIGN KEY(tenant_id,campaign_id) REFERENCES campaigns(tenant_id,id) ON DELETE CASCADE,FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id) ON DELETE CASCADE);
CREATE INDEX campaign_recipient_frequency_idx ON campaign_recipients(tenant_id,contact_id,updated_at);
CREATE TABLE automation_rules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,name text NOT NULL,enabled boolean NOT NULL DEFAULT false,trigger text NOT NULL,conditions jsonb NOT NULL DEFAULT '{}',actions jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE automation_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,rule_id uuid NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,event_id uuid NOT NULL REFERENCES domain_events(id),status text NOT NULL CHECK(status IN ('completed','skipped','failed')),error text,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(rule_id,event_id));
CREATE TABLE departments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,name text NOT NULL,sla_minutes int NOT NULL DEFAULT 60 CHECK(sla_minutes BETWEEN 1 AND 10080),UNIQUE(tenant_id,id));
CREATE TABLE department_members(tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,department_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(department_id,user_id),FOREIGN KEY(tenant_id,department_id) REFERENCES departments(tenant_id,id) ON DELETE CASCADE);
ALTER TABLE conversations ADD COLUMN department_id uuid;
ALTER TABLE conversations ADD CONSTRAINT conversation_department_fk FOREIGN KEY(tenant_id,department_id) REFERENCES departments(tenant_id,id);
CREATE TABLE ai_providers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,name text NOT NULL,kind text NOT NULL CHECK(kind='anthropic'),credentials_enc text NOT NULL,model text NOT NULL,enabled boolean NOT NULL DEFAULT false,UNIQUE(tenant_id,id));
CREATE TABLE ai_agents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,name text NOT NULL,instructions text NOT NULL DEFAULT '',provider_id uuid,source_ids uuid[] NOT NULL DEFAULT '{}',enabled boolean NOT NULL DEFAULT false,is_default boolean NOT NULL DEFAULT false,FOREIGN KEY(tenant_id,provider_id) REFERENCES ai_providers(tenant_id,id));
CREATE UNIQUE INDEX ai_agent_default_idx ON ai_agents(tenant_id) WHERE is_default;
CREATE TABLE ai_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,input_tokens int NOT NULL DEFAULT 0,output_tokens int NOT NULL DEFAULT 0,cost_microusd bigint,model text NOT NULL,status text NOT NULL,error text,created_at timestamptz NOT NULL DEFAULT now());
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['crm_fields','crm_segments','crm_notes','crm_pipelines','crm_deals','crm_tasks','contact_consents','consent_history','campaigns','campaign_recipients','automation_rules','automation_runs','departments','department_members','ai_providers','ai_agents','ai_runs'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO app_user',t);
 END LOOP;
END $$;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
CREATE FUNCTION crm_domain_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO domain_events(tenant_id,type,aggregate_id,dedupe_key,payload) VALUES(NEW.tenant_id,'crm.'||TG_TABLE_NAME||'.'||lower(TG_OP),NEW.id::text,gen_random_uuid()::text,jsonb_build_object('contactId',CASE WHEN TG_TABLE_NAME='contacts' THEN NEW.id ELSE (to_jsonb(NEW)->>'contact_id')::uuid END,'resourceId',NEW.id));
 RETURN NEW;
END $$;
CREATE TRIGGER crm_contact_event AFTER INSERT OR UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION crm_domain_change();
CREATE TRIGGER crm_deal_event AFTER INSERT OR UPDATE ON crm_deals FOR EACH ROW EXECUTE FUNCTION crm_domain_change();
CREATE TRIGGER crm_task_event AFTER INSERT OR UPDATE ON crm_tasks FOR EACH ROW EXECUTE FUNCTION crm_domain_change();
CREATE FUNCTION consent_log() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO consent_history(tenant_id,contact_id,channel_id,status,evidence) VALUES(NEW.tenant_id,NEW.contact_id,NEW.channel_id,NEW.status,NEW.evidence);RETURN NEW;END $$;
CREATE TRIGGER consent_change AFTER INSERT OR UPDATE ON contact_consents FOR EACH ROW EXECUTE FUNCTION consent_log();
