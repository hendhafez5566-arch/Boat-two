CREATE FUNCTION auth_domain_tenant(host text,grace_days integer) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT d.tenant_id FROM workspace_domains d WHERE d.hostname=host AND public_domain_brand(host,grace_days) IS NOT NULL LIMIT 1
$$;
REVOKE ALL ON FUNCTION auth_domain_tenant(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_domain_tenant(text,integer) TO app_user;
