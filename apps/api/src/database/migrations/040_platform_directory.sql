CREATE FUNCTION platform_directory(kind text,needle text,page_number int,page_size int) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; total_count int;BEGIN
 IF kind NOT IN ('companies','users') OR page_number<1 OR page_number>100000 OR page_size<1 OR page_size>100 OR length(needle)>100 THEN RAISE EXCEPTION 'Invalid directory query';END IF;
 IF kind='companies' THEN
  SELECT count(*) INTO total_count FROM tenants WHERE strpos(lower(name),lower(needle))>0 OR strpos(lower(slug),lower(needle))>0 OR strpos(id::text,lower(needle))>0;
  SELECT COALESCE(jsonb_agg(row),'[]') INTO result FROM (SELECT t.id,t.name,t.slug,t.suspended_at,s.status,p.code AS plan_code,(SELECT count(*)::int FROM memberships m WHERE m.tenant_id=t.id) AS members FROM tenants t JOIN subscriptions s ON s.tenant_id=t.id JOIN plans p ON p.id=s.plan_id WHERE strpos(lower(t.name),lower(needle))>0 OR strpos(lower(t.slug),lower(needle))>0 OR strpos(t.id::text,lower(needle))>0 ORDER BY t.created_at DESC,t.id LIMIT page_size OFFSET (page_number-1)*page_size) row;
 ELSE
  SELECT count(*) INTO total_count FROM users WHERE strpos(lower(email),lower(needle))>0 OR strpos(lower(full_name),lower(needle))>0 OR strpos(id::text,lower(needle))>0;
  SELECT COALESCE(jsonb_agg(row),'[]') INTO result FROM (SELECT id,email,full_name,session_version,disabled_at,created_at FROM users WHERE strpos(lower(email),lower(needle))>0 OR strpos(lower(full_name),lower(needle))>0 OR strpos(id::text,lower(needle))>0 ORDER BY created_at DESC,id LIMIT page_size OFFSET (page_number-1)*page_size) row;
 END IF;
 RETURN jsonb_build_object('items',result,'total',total_count,'page',page_number,'limit',page_size);
END $$;
REVOKE ALL ON FUNCTION platform_directory(text,text,int,int) FROM PUBLIC,app_user;
GRANT EXECUTE ON FUNCTION platform_directory(text,text,int,int) TO boat_platform;
