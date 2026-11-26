CREATE FUNCTION platform_create_plan(
  actor uuid, plan_code text, plan_name text, template_code text, quotas jsonb, reason text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF plan_code !~ '^[a-z][a-z0-9-]{1,39}$' OR length(trim(plan_name)) NOT BETWEEN 1 AND 100
    OR length(trim(reason)) NOT BETWEEN 10 AND 1000
    OR jsonb_typeof(quotas) IS DISTINCT FROM 'object'
    OR NOT quotas ?& ARRAY['messages_per_month','contacts','ai_credits']
    OR EXISTS (
      SELECT 1 FROM jsonb_each(quotas) AS q(key, value)
      WHERE key NOT IN ('messages_per_month','contacts','ai_credits')
        OR value::text !~ '^-?[0-9]{1,10}$'
        OR CASE WHEN value::text ~ '^-?[0-9]{1,10}$'
           THEN value::text::bigint NOT BETWEEN -1 AND 1000000000 ELSE true END
    )
  THEN RAISE EXCEPTION 'Invalid plan input'; END IF;

  INSERT INTO plans(code, name, currency, interval, limits, features, is_active)
  SELECT plan_code, trim(plan_name), currency, interval, limits || quotas, features, false
  FROM plans WHERE code=template_code
  ON CONFLICT (code) DO NOTHING;

  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO platform_audit_logs(actor_id, action, details)
  VALUES(actor, 'plan.create', jsonb_build_object('code',plan_code,'template',template_code,'reason',reason,'limits',quotas));
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION platform_create_plan(uuid,text,text,text,jsonb,text) FROM PUBLIC,app_user;
GRANT EXECUTE ON FUNCTION platform_create_plan(uuid,text,text,text,jsonb,text) TO boat_platform;
