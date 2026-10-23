ALTER TABLE workspace_domains ADD COLUMN hosting_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE workspace_domains ADD COLUMN hosting_version int NOT NULL DEFAULT 0;
ALTER TABLE workspace_domains ADD COLUMN hosting_error text;
CREATE FUNCTION public_domain_brand(host text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('hostname',d.hostname,'name',b.name,'logoUrl',b.logo_url,'primaryColor',b.primary_color,'widgetTitle',b.widget_title)
 FROM workspace_domains d JOIN tenants t ON t.id=d.tenant_id JOIN subscriptions s ON s.tenant_id=t.id JOIN plans p ON p.id=s.plan_id JOIN workspace_branding b ON b.tenant_id=t.id
 WHERE d.hostname=host AND d.status='verified' AND d.hosting_enabled AND d.hosting_error IS NULL AND d.verified_at>now()-interval '24 hours' AND t.suspended_at IS NULL
 AND s.status IN ('active','trialing','past_due') AND NOT(s.status='trialing' AND s.trial_ends_at<now()) AND COALESCE((p.features->>'white_label')::boolean,false)
$$;
REVOKE ALL ON FUNCTION public_domain_brand(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_domain_brand(text) TO app_user;
