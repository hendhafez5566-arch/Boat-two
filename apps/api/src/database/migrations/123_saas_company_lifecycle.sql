CREATE OR REPLACE FUNCTION platform_directory_status(kind text,needle text,page_number int,page_size int,status_filter text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; total_count int;
BEGIN
 IF kind NOT IN ('companies','users') OR page_number<1 OR page_number>100000 OR page_size<1 OR page_size>100 OR length(needle)>100 OR
    (kind='companies' AND status_filter NOT IN ('','active','trialing','past_due','canceled','suspended')) OR
    (kind='users' AND status_filter NOT IN ('','active','disabled')) THEN RAISE EXCEPTION 'Invalid directory query'; END IF;
 IF kind='companies' THEN
  SELECT count(*) INTO total_count FROM tenants t JOIN subscriptions s ON s.tenant_id=t.id
  WHERE (strpos(lower(t.name),lower(needle))>0 OR strpos(lower(t.slug),lower(needle))>0 OR strpos(t.id::text,lower(needle))>0)
  AND (status_filter='' OR (status_filter='suspended' AND t.suspended_at IS NOT NULL) OR (status_filter<>'suspended' AND t.suspended_at IS NULL AND s.status=status_filter));
  SELECT COALESCE(jsonb_agg(r),'[]') INTO result FROM (
   SELECT t.id,t.name,t.slug,t.suspended_at,t.created_at,s.status,s.trial_ends_at,s.current_period_end,p.code AS plan_code,(SELECT count(*)::int FROM memberships m WHERE m.tenant_id=t.id) AS members
   FROM tenants t JOIN subscriptions s ON s.tenant_id=t.id JOIN plans p ON p.id=s.plan_id
   WHERE (strpos(lower(t.name),lower(needle))>0 OR strpos(lower(t.slug),lower(needle))>0 OR strpos(t.id::text,lower(needle))>0)
   AND (status_filter='' OR (status_filter='suspended' AND t.suspended_at IS NOT NULL) OR (status_filter<>'suspended' AND t.suspended_at IS NULL AND s.status=status_filter))
   ORDER BY t.created_at DESC,t.id LIMIT page_size OFFSET (page_number-1)*page_size) r;
 ELSE
  SELECT count(*) INTO total_count FROM users u WHERE (strpos(lower(u.email),lower(needle))>0 OR strpos(lower(u.full_name),lower(needle))>0 OR strpos(u.id::text,lower(needle))>0)
  AND (status_filter='' OR (status_filter='active' AND u.disabled_at IS NULL) OR (status_filter='disabled' AND u.disabled_at IS NOT NULL));
  SELECT COALESCE(jsonb_agg(r),'[]') INTO result FROM (
   SELECT u.id,u.email,u.full_name,u.session_version,u.disabled_at,u.created_at FROM users u WHERE (strpos(lower(u.email),lower(needle))>0 OR strpos(lower(u.full_name),lower(needle))>0 OR strpos(u.id::text,lower(needle))>0)
   AND (status_filter='' OR (status_filter='active' AND u.disabled_at IS NULL) OR (status_filter='disabled' AND u.disabled_at IS NOT NULL))
   ORDER BY u.created_at DESC,u.id LIMIT page_size OFFSET (page_number-1)*page_size) r;
 END IF;
 RETURN jsonb_build_object('items',result,'total',total_count,'page',page_number,'limit',page_size);
END $$;
REVOKE ALL ON FUNCTION platform_directory_status(text,text,int,int,text) FROM PUBLIC,app_user;
GRANT EXECUTE ON FUNCTION platform_directory_status(text,text,int,int,text) TO boat_platform;

CREATE FUNCTION platform_create_company(actor uuid,tid uuid,uid uuid,company_name text,company_slug text,owner_name text,owner_email text,setup_hash text,plan_code text,days integer,reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pid uuid;
BEGIN
 IF length(trim(company_name)) NOT BETWEEN 1 AND 120 OR length(trim(owner_name)) NOT BETWEEN 1 AND 120 OR length(owner_email)>254 OR setup_hash NOT LIKE 'setup$%' OR days NOT BETWEEN 0 AND 365 OR length(trim(reason)) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Invalid onboarding'; END IF;
 SELECT id INTO pid FROM plans WHERE code=plan_code AND is_active;
 IF pid IS NULL OR (days=0 AND plan_code<>'free') THEN RAISE EXCEPTION 'Select a valid trial plan or free plan'; END IF;
 PERFORM set_config('app.tenant_id',tid::text,true);PERFORM set_config('app.actor_id',actor::text,true);
 INSERT INTO tenants(id,name,slug) VALUES(tid,company_name,company_slug);
 INSERT INTO users(id,email,full_name,password_hash) VALUES(uid,lower(owner_email),owner_name,setup_hash);
 INSERT INTO memberships(tenant_id,user_id,role) VALUES(tid,uid,'owner');
 INSERT INTO subscriptions(tenant_id,plan_id,status,trial_ends_at) VALUES(tid,pid,CASE WHEN days=0 THEN 'active' ELSE 'trialing' END,CASE WHEN days=0 THEN NULL ELSE now()+make_interval(days=>days) END);
 INSERT INTO platform_audit_logs(actor_id,action,tenant_id,details) VALUES(actor,'company.created',tid,jsonb_build_object('ownerId',uid,'plan',plan_code,'trialDays',days,'reason',reason,'source','administrative_onboarding'));
END $$;
REVOKE ALL ON FUNCTION platform_create_company(uuid,uuid,uuid,text,text,text,text,text,text,integer,text) FROM PUBLIC,app_user;
GRANT EXECUTE ON FUNCTION platform_create_company(uuid,uuid,uuid,text,text,text,text,text,text,integer,text) TO boat_platform;
