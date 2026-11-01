-- Reuse the existing tenant-isolated audit log. History starts with this release;
-- no past changes are guessed or backfilled. Same-stage saves create no entry.
CREATE FUNCTION audit_crm_stage_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO audit_logs(tenant_id,actor_id,action,resource_type,resource_id,details)
 VALUES(NEW.tenant_id,NULLIF(current_setting('app.actor_id',true),'')::uuid,
 'stage_changed','crm_deals',NEW.id::text,
 jsonb_build_object('from',OLD.stage,'to',NEW.stage));
 RETURN NEW;
END $$;
CREATE TRIGGER crm_stage_history AFTER UPDATE OF stage ON crm_deals
 FOR EACH ROW WHEN (OLD.stage IS DISTINCT FROM NEW.stage) EXECUTE FUNCTION audit_crm_stage_change();
