ALTER TABLE tenants ADD COLUMN suspended_at timestamptz;
ALTER TABLE users ADD COLUMN session_version int NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN disabled_at timestamptz;
CREATE TABLE platform_audit_logs(id bigserial PRIMARY KEY,actor_id uuid NOT NULL,action text NOT NULL,tenant_id uuid,details jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON platform_audit_logs FROM PUBLIC,app_user;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='boat_platform') THEN CREATE ROLE boat_platform NOLOGIN NOINHERIT; END IF; END $$;
CREATE FUNCTION platform_snapshot() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object(
 'companies',(SELECT COALESCE(jsonb_agg(row),'[]') FROM (SELECT t.id,t.name,t.slug,t.suspended_at,s.status,p.code AS plan_code,(SELECT count(*)::int FROM memberships m WHERE m.tenant_id=t.id) AS members FROM tenants t JOIN subscriptions s ON s.tenant_id=t.id JOIN plans p ON p.id=s.plan_id ORDER BY t.created_at DESC LIMIT 500) row),
 'users',(SELECT COALESCE(jsonb_agg(row),'[]') FROM (SELECT id,email,full_name,session_version,disabled_at,created_at FROM users ORDER BY created_at DESC LIMIT 500) row),
 'plans',(SELECT COALESCE(jsonb_agg(row),'[]') FROM (SELECT id,code,name,price_cents,is_active,limits,features FROM plans ORDER BY sort_order) row),
 'audit',(SELECT COALESCE(jsonb_agg(row),'[]') FROM (SELECT * FROM platform_audit_logs ORDER BY id DESC LIMIT 100) row))
$$;
CREATE FUNCTION platform_change_company(actor uuid,tid uuid,new_name text,suspend boolean,reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF length(trim(reason))<10 OR length(new_name) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Invalid input'; END IF;
 PERFORM set_config('app.tenant_id',tid::text,true);PERFORM set_config('app.actor_id',actor::text,true);
 UPDATE tenants SET name=new_name,suspended_at=CASE WHEN suspend THEN COALESCE(suspended_at,now()) ELSE NULL END WHERE id=tid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company not found';END IF;
 INSERT INTO platform_audit_logs(actor_id,action,tenant_id,details) VALUES(actor,'company.update',tid,jsonb_build_object('name',new_name,'suspended',suspend,'reason',reason));
END $$;
CREATE FUNCTION platform_change_subscription(actor uuid,tid uuid,plan_code text,new_status text,reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pid uuid; BEGIN
 IF length(trim(reason))<10 OR new_status NOT IN ('active','trialing','past_due','canceled') THEN RAISE EXCEPTION 'Invalid input'; END IF;
 SELECT id INTO pid FROM plans WHERE code=plan_code AND is_active;IF pid IS NULL THEN RAISE EXCEPTION 'Plan not found';END IF;
 PERFORM set_config('app.tenant_id',tid::text,true);PERFORM set_config('app.actor_id',actor::text,true);
 UPDATE subscriptions SET plan_id=pid,status=new_status,updated_at=now() WHERE tenant_id=tid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company not found';END IF;
 INSERT INTO platform_audit_logs(actor_id,action,tenant_id,details) VALUES(actor,'subscription.override',tid,jsonb_build_object('plan',plan_code,'status',new_status,'reason',reason,'providerUpdated',false));
END $$;
CREATE FUNCTION platform_revoke_user(actor uuid,uid uuid,reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF length(trim(reason))<10 THEN RAISE EXCEPTION 'Reason required';END IF;
 UPDATE users SET session_version=session_version+1 WHERE id=uid;IF NOT FOUND THEN RAISE EXCEPTION 'User not found';END IF;
 UPDATE refresh_tokens SET revoked_at=now() WHERE user_id=uid AND revoked_at IS NULL;
 INSERT INTO platform_audit_logs(actor_id,action,details) VALUES(actor,'user.revoke_sessions',jsonb_build_object('userId',uid,'reason',reason));
END $$;
CREATE FUNCTION platform_change_plan(actor uuid,pcode text,new_name text,enabled boolean,new_limits jsonb,new_features jsonb,reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF length(trim(reason))<10 OR length(new_name) NOT BETWEEN 1 AND 100 OR jsonb_typeof(new_limits)<>'object' OR jsonb_typeof(new_features)<>'object' THEN RAISE EXCEPTION 'Invalid input';END IF;
 UPDATE plans SET name=new_name,is_active=enabled,limits=new_limits,features=new_features WHERE code=pcode;
 IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found';END IF;
 INSERT INTO platform_audit_logs(actor_id,action,details) VALUES(actor,'plan.update',jsonb_build_object('code',pcode,'reason',reason,'limits',new_limits,'features',new_features));
END $$;
REVOKE ALL ON FUNCTION platform_snapshot(),platform_change_company(uuid,uuid,text,boolean,text),platform_change_subscription(uuid,uuid,text,text,text),platform_revoke_user(uuid,uuid,text),platform_change_plan(uuid,text,text,boolean,jsonb,jsonb,text) FROM PUBLIC,app_user;
GRANT USAGE ON SCHEMA public TO boat_platform;
GRANT EXECUTE ON FUNCTION platform_snapshot(),platform_change_company(uuid,uuid,text,boolean,text),platform_change_subscription(uuid,uuid,text,text,text),platform_revoke_user(uuid,uuid,text),platform_change_plan(uuid,text,text,boolean,jsonb,jsonb,text) TO boat_platform;

CREATE FUNCTION platform_change_user(actor uuid,uid uuid,new_name text,disabled boolean,reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF length(trim(reason))<10 OR length(trim(new_name)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Invalid input';END IF;
 UPDATE users SET full_name=new_name,disabled_at=CASE WHEN disabled THEN now() ELSE NULL END,session_version=session_version+1 WHERE id=uid;
 IF NOT FOUND THEN RAISE EXCEPTION 'User not found';END IF;
 UPDATE refresh_tokens SET revoked_at=now() WHERE user_id=uid AND revoked_at IS NULL;
 INSERT INTO platform_audit_logs(actor_id,action,details) VALUES(actor,'user.update',jsonb_build_object('userId',uid,'disabled',disabled,'reason',reason));
END $$;
REVOKE ALL ON FUNCTION platform_change_user(uuid,uuid,text,boolean,text) FROM PUBLIC,app_user;
GRANT EXECUTE ON FUNCTION platform_change_user(uuid,uuid,text,boolean,text) TO boat_platform;
