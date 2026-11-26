CREATE FUNCTION workflow_schedule_maintenance(p_limit int) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 INSERT INTO domain_events(tenant_id,type,aggregate_id,dedupe_key,payload)
 SELECT t.tenant_id,'workflow.maintenance',t.id::text,'workflow:maintenance:'||t.id||':'||floor(extract(epoch FROM now())/60),
   jsonb_build_object('id',t.id)
 FROM crm_tasks t
 LEFT JOIN memberships m ON m.tenant_id=t.tenant_id AND m.user_id=t.assigned_to
 LEFT JOIN users u ON u.id=m.user_id
 WHERE t.order_workflow IS NOT NULL AND t.status='open'
   AND (
     EXISTS(
       SELECT 1 FROM memberships recipient JOIN users ru ON ru.id=recipient.user_id AND ru.disabled_at IS NULL
       WHERE recipient.tenant_id=t.tenant_id
         AND ((t.due_at<=now() AND recipient.user_id=t.assigned_to)
           OR (t.due_at<=now()-interval '30 minutes' AND recipient.role IN ('owner','admin')))
         AND NOT EXISTS(
           SELECT 1 FROM crm_notifications n WHERE n.tenant_id=t.tenant_id AND n.user_id=recipient.user_id
             AND n.dedupe_key='workflow-overdue:'||t.id||':'||(t.order_workflow->>'stage')||':'||extract(epoch FROM t.due_at))
     )
     OR (NOT(coalesce(m.available,false) AND u.disabled_at IS NULL) AND EXISTS(
       SELECT 1 FROM department_members dm
       JOIN departments d ON d.tenant_id=dm.tenant_id AND d.id=dm.department_id AND d.archived_at IS NULL
       JOIN memberships replacement ON replacement.tenant_id=dm.tenant_id AND replacement.user_id=dm.user_id AND replacement.available
       JOIN users ru ON ru.id=replacement.user_id AND ru.disabled_at IS NULL
       WHERE dm.tenant_id=t.tenant_id AND dm.department_id::text=
         t.order_workflow->'stages'->((t.order_workflow->>'stage')::int)->>'departmentId'
     ))
   )
 ORDER BY t.due_at,t.id
 LIMIT LEAST(GREATEST(p_limit,1),500)
 ON CONFLICT DO NOTHING
$$;
REVOKE ALL ON FUNCTION workflow_schedule_maintenance(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION workflow_schedule_maintenance(int) TO app_user;
