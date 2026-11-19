-- Read only the next bounded group of tenants with persisted assignment queues.
CREATE OR REPLACE FUNCTION assignment_recovery_tenants(p_after uuid,p_limit int)
RETURNS TABLE(tenant_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT DISTINCT cv.tenant_id FROM conversations cv JOIN tenants t ON t.id=cv.tenant_id
 WHERE cv.assigned_to IS NULL AND cv.status<>'closed' AND cv.archived_at IS NULL AND t.suspended_at IS NULL
  AND (p_after IS NULL OR cv.tenant_id>p_after)
  AND EXISTS(SELECT 1 FROM messages m WHERE m.conversation_id=cv.id AND m.is_internal AND m.content->>'event'='assignment_waiting')
 ORDER BY cv.tenant_id LIMIT LEAST(GREATEST(p_limit,1),10)
$$;
REVOKE ALL ON FUNCTION assignment_recovery_tenants(uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION assignment_recovery_tenants(uuid,int) TO app_user;
