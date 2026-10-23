ALTER TABLE crm_jobs ADD COLUMN expired_at timestamptz;
CREATE FUNCTION crm_retention_preview(cutoff timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tid uuid=NULLIF(current_setting('app.tenant_id',true),'')::uuid; h bigint; j bigint;
BEGIN
 IF tid IS NULL OR cutoff>now()-interval '7 days' THEN RAISE EXCEPTION 'Choose a retention cutoff at least seven days old'; END IF;
 SELECT count(*) INTO h FROM crm_contact_history WHERE tenant_id=tid AND recorded_at<cutoff AND change_id NOT IN (SELECT DISTINCT ON(contact_id) change_id FROM crm_contact_history WHERE tenant_id=tid AND recorded_at<cutoff ORDER BY contact_id,recorded_at DESC,change_id DESC);
 SELECT count(*) INTO j FROM crm_jobs WHERE tenant_id=tid AND status IN ('completed','canceled') AND updated_at<cutoff AND expired_at IS NULL;
 RETURN jsonb_build_object('historyRows',h,'jobPayloads',j,'cutoff',cutoff);
END $$;
CREATE FUNCTION crm_retention_apply(cutoff timestamptz,actor uuid,expected_history bigint,expected_jobs bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tid uuid=NULLIF(current_setting('app.tenant_id',true),'')::uuid; preview jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(190723,67);
 preview=crm_retention_preview(cutoff);
 IF (preview->>'historyRows')::bigint<>expected_history OR (preview->>'jobPayloads')::bigint<>expected_jobs THEN RAISE EXCEPTION 'Retention counts changed; preview again'; END IF;
 IF EXISTS(SELECT 1 FROM crm_contact_changes WHERE tenant_id=tid) THEN RAISE EXCEPTION 'CRM history is catching up; retry after materialization'; END IF;
 DELETE FROM crm_contact_history WHERE tenant_id=tid AND recorded_at<cutoff AND change_id NOT IN (SELECT DISTINCT ON(contact_id) change_id FROM crm_contact_history WHERE tenant_id=tid AND recorded_at<cutoff ORDER BY contact_id,recorded_at DESC,change_id DESC);
 UPDATE crm_jobs SET input='{}',result='[]',errors='[]',expired_at=now() WHERE tenant_id=tid AND status IN ('completed','canceled') AND updated_at<cutoff AND expired_at IS NULL;
 INSERT INTO crm_history_bounds VALUES(tid,cutoff) ON CONFLICT(tenant_id) DO UPDATE SET available_from=greatest(crm_history_bounds.available_from,cutoff);
 INSERT INTO audit_logs(tenant_id,actor_id,action,resource_type,details) VALUES(tid,actor,'crm_retention_cleanup','crm_history',preview);
 RETURN preview;
END $$;
REVOKE ALL ON FUNCTION crm_retention_preview(timestamptz),crm_retention_apply(timestamptz,uuid,bigint,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm_retention_preview(timestamptz),crm_retention_apply(timestamptz,uuid,bigint,bigint) TO app_user;
