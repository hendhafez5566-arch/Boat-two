ALTER TABLE order_workflows
  ADD COLUMN source text NOT NULL DEFAULT 'order' CHECK (source IN ('order','conversation','contact','task')),
  ADD COLUMN start_condition text NOT NULL DEFAULT 'manual' CHECK (start_condition IN ('manual','created','unassigned'));

CREATE UNIQUE INDEX workflow_conversation_tenant_key ON conversations(tenant_id,id);
ALTER TABLE crm_tasks
  ADD COLUMN workflow_conversation_id uuid,
  ADD COLUMN workflow_contact_id uuid,
  ADD FOREIGN KEY (tenant_id, workflow_conversation_id) REFERENCES conversations(tenant_id,id) ON DELETE CASCADE,
  ADD FOREIGN KEY (tenant_id, workflow_contact_id) REFERENCES contacts(tenant_id,id) ON DELETE CASCADE;
CREATE UNIQUE INDEX crm_tasks_workflow_conversation ON crm_tasks(tenant_id,workflow_conversation_id)
  WHERE workflow_conversation_id IS NOT NULL;
CREATE UNIQUE INDEX crm_tasks_workflow_contact ON crm_tasks(tenant_id,workflow_contact_id)
  WHERE workflow_contact_id IS NOT NULL;

CREATE FUNCTION workflow_source_created() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
  IF TG_ARGV[0] = 'task' AND to_jsonb(NEW)->'order_workflow' IS DISTINCT FROM 'null'::jsonb THEN
    RETURN NEW;
  END IF;
  SELECT id INTO target FROM order_workflows
    WHERE tenant_id=NEW.tenant_id AND source=TG_ARGV[0] AND archived_at IS NULL
      AND (start_condition='created' OR (start_condition='unassigned' AND
        coalesce(to_jsonb(NEW)->>'assigned_to',to_jsonb(NEW)->>'owner_id') IS NULL))
    ORDER BY CASE start_condition WHEN 'unassigned' THEN 0 ELSE 1 END, id LIMIT 1;
  IF target IS NOT NULL THEN
    INSERT INTO domain_events(tenant_id,type,aggregate_id,payload,dedupe_key)
      VALUES(NEW.tenant_id,'workflow.source.created',NEW.id,
        jsonb_build_object('source',TG_ARGV[0],'id',NEW.id,'definitionId',target),
        'workflow:start:'||TG_ARGV[0]||':'||NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER workflow_order_created AFTER INSERT ON commerce_orders FOR EACH ROW EXECUTE FUNCTION workflow_source_created('order');
CREATE TRIGGER workflow_contact_created AFTER INSERT ON contacts FOR EACH ROW EXECUTE FUNCTION workflow_source_created('contact');
CREATE TRIGGER workflow_conversation_created AFTER INSERT ON conversations FOR EACH ROW EXECUTE FUNCTION workflow_source_created('conversation');
CREATE TRIGGER workflow_task_created AFTER INSERT ON crm_tasks FOR EACH ROW EXECUTE FUNCTION workflow_source_created('task');
