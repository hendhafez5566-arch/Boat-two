ALTER TABLE automation_rules ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE automation_rules ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE automation_rules ADD COLUMN canvas_positions jsonb NOT NULL DEFAULT '{}';
CREATE TABLE automation_rule_versions(tenant_id uuid NOT NULL REFERENCES tenants(id),rule_id uuid NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,revision integer NOT NULL,snapshot jsonb NOT NULL,actor_id uuid,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(rule_id,revision));
ALTER TABLE automation_rule_versions ENABLE ROW LEVEL SECURITY;ALTER TABLE automation_rule_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON automation_rule_versions USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT ON automation_rule_versions TO app_user;
CREATE FUNCTION version_automation_rule() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_WHEN='BEFORE' THEN NEW.revision:=OLD.revision+1;NEW.updated_at:=now();RETURN NEW;END IF;
 INSERT INTO automation_rule_versions(tenant_id,rule_id,revision,snapshot,actor_id) VALUES(NEW.tenant_id,NEW.id,NEW.revision,jsonb_build_object('name',NEW.name,'enabled',NEW.enabled,'trigger',NEW.trigger,'conditions',NEW.conditions,'actions',NEW.actions,'canvas_positions',NEW.canvas_positions),NULLIF(current_setting('app.actor_id',true),'')::uuid);
 RETURN NEW;
END $$;
CREATE TRIGGER automation_revision BEFORE UPDATE ON automation_rules FOR EACH ROW EXECUTE FUNCTION version_automation_rule();
CREATE TRIGGER automation_history AFTER INSERT OR UPDATE ON automation_rules FOR EACH ROW EXECUTE FUNCTION version_automation_rule();
INSERT INTO automation_rule_versions(tenant_id,rule_id,revision,snapshot) SELECT tenant_id,id,revision,jsonb_build_object('name',name,'enabled',enabled,'trigger',trigger,'conditions',conditions,'actions',actions,'canvas_positions',canvas_positions) FROM automation_rules;

ALTER TABLE automation_runs ADD COLUMN rule_revision integer;
