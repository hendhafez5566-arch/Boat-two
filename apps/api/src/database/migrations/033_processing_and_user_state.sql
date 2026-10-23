ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
CREATE OR REPLACE FUNCTION platform_snapshot() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object(
 'companies',(SELECT COALESCE(jsonb_agg(row),'[]') FROM (SELECT t.id,t.name,t.slug,t.suspended_at,s.status,p.code AS plan_code,(SELECT count(*)::int FROM memberships m WHERE m.tenant_id=t.id) AS members FROM tenants t JOIN subscriptions s ON s.tenant_id=t.id JOIN plans p ON p.id=s.plan_id ORDER BY t.created_at DESC LIMIT 500) row),
 'users',(SELECT COALESCE(jsonb_agg(row),'[]') FROM (SELECT id,email,full_name,session_version,disabled_at,created_at FROM users ORDER BY created_at DESC LIMIT 500) row),
 'plans',(SELECT COALESCE(jsonb_agg(row),'[]') FROM (SELECT id,code,name,price_cents,is_active,limits,features FROM plans ORDER BY sort_order) row),
 'audit',(SELECT COALESCE(jsonb_agg(row),'[]') FROM (SELECT * FROM platform_audit_logs ORDER BY id DESC LIMIT 100) row))
$$;
CREATE OR REPLACE FUNCTION platform_change_user(actor uuid,uid uuid,new_name text,disabled boolean,reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF length(trim(reason))<10 OR length(trim(new_name)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Invalid input';END IF;
 UPDATE users SET full_name=new_name,disabled_at=CASE WHEN disabled THEN now() ELSE NULL END,session_version=session_version+1 WHERE id=uid;
 IF NOT FOUND THEN RAISE EXCEPTION 'User not found';END IF;
 UPDATE refresh_tokens SET revoked_at=now() WHERE user_id=uid AND revoked_at IS NULL;
 INSERT INTO platform_audit_logs(actor_id,action,details) VALUES(actor,'user.update',jsonb_build_object('userId',uid,'disabled',disabled,'reason',reason));
END $$;
REVOKE ALL ON FUNCTION platform_change_user(uuid,uuid,text,boolean,text) FROM PUBLIC,app_user;
GRANT EXECUTE ON FUNCTION platform_change_user(uuid,uuid,text,boolean,text) TO boat_platform;

ALTER TABLE knowledge_sources DROP CONSTRAINT knowledge_sources_status_check;
ALTER TABLE knowledge_sources ADD CONSTRAINT knowledge_sources_status_check CHECK(status IN ('pending','processing','ready','failed','blocked','canceled'));
