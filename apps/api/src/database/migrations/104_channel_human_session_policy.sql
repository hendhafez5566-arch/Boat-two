-- Extend the existing Inbox policy worker; preserve all legacy workspace defaults and SLA rules.
CREATE OR REPLACE FUNCTION inbox_policy_due(p_limit int)
RETURNS TABLE(id uuid,tenant_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT cv.id,cv.tenant_id
  FROM conversations cv
  JOIN channels ch ON ch.id=cv.channel_id AND ch.tenant_id=cv.tenant_id
  JOIN inbox_settings s ON s.tenant_id=cv.tenant_id
  LEFT JOIN departments d ON d.id=cv.department_id
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN jsonb_typeof(ch.settings#>'{botManagerActive,sharedInbox,humanSessionExpiryMinutes}')='number'
        AND (ch.settings#>>'{botManagerActive,sharedInbox,humanSessionExpiryMinutes}') ~ '^[0-9]{1,6}$'
      THEN CASE WHEN (ch.settings#>>'{botManagerActive,sharedInbox,humanSessionExpiryMinutes}')::int BETWEEN 1 AND 525600
        THEN (ch.settings#>>'{botManagerActive,sharedInbox,humanSessionExpiryMinutes}')::int
        ELSE s.human_session_minutes END
      ELSE s.human_session_minutes END AS minutes
  ) expiry
  WHERE cv.status<>'closed' AND (
    (cv.handled_by='human' AND expiry.minutes>0 AND cv.human_since<now()-make_interval(mins=>expiry.minutes))
    OR (cv.handled_by='human' AND s.sla_escalation_enabled AND d.sla_minutes>0
      AND cv.last_inbound_at<now()-make_interval(mins=>d.sla_minutes)
      AND (cv.sla_escalated_at IS NULL OR cv.sla_escalated_at<cv.last_inbound_at)
      AND NOT EXISTS(SELECT 1 FROM messages m WHERE m.conversation_id=cv.id AND m.sender_type='agent'
        AND NOT m.is_internal AND m.created_at>=cv.last_inbound_at))
  )
  ORDER BY cv.last_message_at LIMIT LEAST(p_limit,100)
$$;
REVOKE ALL ON FUNCTION inbox_policy_due(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inbox_policy_due(int) TO app_user;
