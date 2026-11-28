CREATE FUNCTION platform_directory_status(kind text,needle text,page_number int,page_size int,status_filter text) RETURNS jsonb
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
   SELECT t.id,t.name,t.slug,t.suspended_at,s.status,p.code AS plan_code,(SELECT count(*)::int FROM memberships m WHERE m.tenant_id=t.id) AS members
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
