-- Additive: existing 082–087 installations retain their migration history.
CREATE FUNCTION integration_handoff_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.handled_by IS DISTINCT FROM NEW.handled_by AND NEW.handled_by='human' THEN
  INSERT INTO domain_events(tenant_id,type,aggregate_id,payload,dedupe_key)
  VALUES(NEW.tenant_id,'conversation.handoff',NEW.id::text,
   jsonb_build_object('conversationId',NEW.id,'contactId',NEW.contact_id,'assignedTo',NEW.assigned_to,'departmentId',NEW.department_id),
   'handoff:'||gen_random_uuid()::text);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER integration_handoff AFTER UPDATE OF handled_by ON conversations
 FOR EACH ROW EXECUTE FUNCTION integration_handoff_event();
