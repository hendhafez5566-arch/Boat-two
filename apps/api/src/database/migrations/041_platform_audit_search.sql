CREATE INDEX platform_audit_filter_idx ON platform_audit_logs(action,created_at DESC,id DESC);
CREATE FUNCTION platform_audit_page(actor_filter uuid,tenant_filter uuid,action_filter text,from_date timestamptz,to_date timestamptz,before_id bigint,page_size int) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;next_id bigint;BEGIN
 IF page_size NOT BETWEEN 1 AND 500 OR length(action_filter)>100 OR to_date<=from_date OR to_date-from_date>interval '366 days' OR before_id<1 THEN RAISE EXCEPTION 'Invalid audit query';END IF;
 WITH selected AS (SELECT id,actor_id,tenant_id,action,details,created_at FROM platform_audit_logs WHERE (actor_filter IS NULL OR actor_id=actor_filter) AND (tenant_filter IS NULL OR tenant_id=tenant_filter) AND (action_filter='' OR action=action_filter) AND created_at>=from_date AND created_at<to_date AND (before_id IS NULL OR id<before_id) ORDER BY id DESC LIMIT page_size)
 SELECT COALESCE(jsonb_agg(row ORDER BY id DESC),'[]'),CASE WHEN count(*)=page_size THEN min(id) END INTO result,next_id FROM selected row;
 RETURN jsonb_build_object('items',result,'nextCursor',next_id::text);
END $$;
REVOKE ALL ON FUNCTION platform_audit_page(uuid,uuid,text,timestamptz,timestamptz,bigint,int) FROM PUBLIC,app_user;
GRANT EXECUTE ON FUNCTION platform_audit_page(uuid,uuid,text,timestamptz,timestamptz,bigint,int) TO boat_platform;
