-- Optional direct deal link, constrained to the same tenant and canonical customer.
ALTER TABLE crm_deals ADD CONSTRAINT crm_deals_tenant_contact_id UNIQUE(tenant_id,contact_id,id);
ALTER TABLE crm_tasks ADD COLUMN deal_id uuid;
ALTER TABLE crm_tasks ADD CONSTRAINT crm_task_deal_tenant_fk FOREIGN KEY(tenant_id,contact_id,deal_id) REFERENCES crm_deals(tenant_id,contact_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX crm_tasks_deal_idx ON crm_tasks(tenant_id,deal_id) WHERE deal_id IS NOT NULL;
CREATE FUNCTION crm_v3_semantic_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind text; contact uuid; resource uuid; key text;
BEGIN
 resource:=NEW.id;
 contact:=CASE WHEN TG_TABLE_NAME='contacts' THEN NEW.id ELSE (to_jsonb(NEW)->>'contact_id')::uuid END;
 IF TG_TABLE_NAME='contacts' THEN
  IF OLD.tags IS DISTINCT FROM NEW.tags AND NOT NEW.tags <@ OLD.tags THEN kind:='crm.tag.added'; END IF;
  IF OLD.lifecycle IS DISTINCT FROM NEW.lifecycle THEN
   INSERT INTO domain_events(tenant_id,type,aggregate_id,dedupe_key,payload)
   VALUES(NEW.tenant_id,'crm.lifecycle.changed',NEW.id::text,gen_random_uuid()::text,jsonb_build_object('contactId',contact,'resourceId',resource,'from',OLD.lifecycle,'to',NEW.lifecycle));
  END IF;
 ELSIF TG_TABLE_NAME='crm_deals' THEN
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
   INSERT INTO domain_events(tenant_id,type,aggregate_id,dedupe_key,payload)
   VALUES(NEW.tenant_id,'crm.deal.stage_changed',NEW.id::text,gen_random_uuid()::text,jsonb_build_object('contactId',contact,'resourceId',resource,'from',OLD.stage,'to',NEW.stage));
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('won','lost') THEN kind:='crm.deal.closed'; END IF;
 ELSIF TG_TABLE_NAME='conversations' THEN
  IF TG_OP='INSERT' THEN kind:='crm.conversation.created';
  ELSIF OLD.handled_by IS DISTINCT FROM NEW.handled_by AND NEW.handled_by='human' THEN kind:='crm.conversation.taken'; END IF;
 END IF;
 IF kind IS NOT NULL THEN
  INSERT INTO domain_events(tenant_id,type,aggregate_id,dedupe_key,payload)
  VALUES(NEW.tenant_id,kind,NEW.id::text,gen_random_uuid()::text,jsonb_build_object('contactId',contact,'resourceId',resource));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_contact_semantic AFTER UPDATE OF tags,lifecycle ON contacts FOR EACH ROW EXECUTE FUNCTION crm_v3_semantic_event();
CREATE TRIGGER crm_deal_semantic AFTER UPDATE OF stage,status ON crm_deals FOR EACH ROW EXECUTE FUNCTION crm_v3_semantic_event();
CREATE TRIGGER crm_conversation_semantic AFTER INSERT OR UPDATE OF handled_by ON conversations FOR EACH ROW EXECUTE FUNCTION crm_v3_semantic_event();
-- Narrow scheduler: creates only internal overdue events; no data is returned across tenants.
CREATE FUNCTION crm_v3_schedule_due(p_limit int DEFAULT 100) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 INSERT INTO domain_events(tenant_id,type,aggregate_id,dedupe_key,payload)
 SELECT t.tenant_id,'crm.task.overdue',t.id::text,'crm-overdue:'||t.id::text||':'||extract(epoch FROM t.due_at)::text,
 jsonb_build_object('contactId',t.contact_id,'resourceId',t.id)
 FROM crm_tasks t JOIN contacts ct ON ct.tenant_id=t.tenant_id AND ct.id=t.contact_id
 WHERE t.status='open' AND t.due_at<now() AND ct.archived_at IS NULL AND ct.merged_into_id IS NULL
 AND NOT EXISTS(SELECT 1 FROM domain_events e WHERE e.tenant_id=t.tenant_id AND e.dedupe_key='crm-overdue:'||t.id::text||':'||extract(epoch FROM t.due_at)::text)
 ORDER BY t.due_at,t.id LIMIT LEAST(GREATEST(p_limit,1),500)
 ON CONFLICT(tenant_id,dedupe_key) DO NOTHING
$$;
REVOKE ALL ON FUNCTION crm_v3_schedule_due(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm_v3_schedule_due(int) TO app_user;
ALTER TABLE automation_rules ADD CONSTRAINT automation_rule_tenant_unique UNIQUE(tenant_id,id);
ALTER TABLE crm_deals ADD COLUMN automation_rule_id uuid;
ALTER TABLE crm_deals ADD CONSTRAINT crm_deal_automation_rule_fk FOREIGN KEY(tenant_id,automation_rule_id) REFERENCES automation_rules(tenant_id,id);
CREATE INDEX crm_deal_rule_open_idx ON crm_deals(tenant_id,contact_id,pipeline_id,automation_rule_id) WHERE status='open' AND automation_rule_id IS NOT NULL;
