CREATE TABLE saas_registration_policy(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 self_registration boolean NOT NULL DEFAULT true,
 trial_plan_code text NOT NULL DEFAULT 'pro' REFERENCES plans(code),
 trial_days integer NOT NULL DEFAULT 14 CHECK(trial_days BETWEEN 0 AND 365),
 updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON saas_registration_policy FROM PUBLIC,app_user,boat_platform;
-- A missing row retains the existing environment default until the operator saves policy.
CREATE FUNCTION saas_registration_settings(default_days integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE((SELECT jsonb_build_object('selfRegistration',self_registration,'trialPlanCode',trial_plan_code,'trialDays',trial_days,'updatedAt',updated_at) FROM saas_registration_policy WHERE singleton),
 jsonb_build_object('selfRegistration',true,'trialPlanCode','pro','trialDays',LEAST(365,GREATEST(0,default_days)),'updatedAt',NULL))
$$;
CREATE FUNCTION platform_set_registration_policy(actor uuid,enabled boolean,plan_code text,days integer,reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF days NOT BETWEEN 0 AND 365 OR length(trim(reason)) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Invalid policy'; END IF;
 IF NOT EXISTS(SELECT 1 FROM plans WHERE code=plan_code AND is_active) OR NOT EXISTS(SELECT 1 FROM plans WHERE code='free' AND is_active) THEN RAISE EXCEPTION 'Active plan required';END IF;
 INSERT INTO saas_registration_policy(singleton,self_registration,trial_plan_code,trial_days) VALUES(true,enabled,plan_code,days)
 ON CONFLICT(singleton) DO UPDATE SET self_registration=EXCLUDED.self_registration,trial_plan_code=EXCLUDED.trial_plan_code,trial_days=EXCLUDED.trial_days,updated_at=now();
 INSERT INTO platform_audit_logs(actor_id,action,details) VALUES(actor,'registration.policy.update',jsonb_build_object('enabled',enabled,'plan',plan_code,'days',days,'reason',reason));
END $$;
CREATE FUNCTION saas_registration_record(tid uuid,uid uuid,default_days integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg jsonb;pid uuid;days integer;chosen_code text;
BEGIN
 IF tid IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid OR NOT EXISTS(SELECT 1 FROM memberships WHERE tenant_id=tid AND user_id=uid AND role='owner') THEN RAISE EXCEPTION 'Registration scope invalid';END IF;
 cfg:=saas_registration_settings(default_days);
 IF NOT (cfg->>'selfRegistration')::boolean THEN RAISE EXCEPTION 'Registration closed';END IF;
 days:=(cfg->>'trialDays')::integer;
 chosen_code:=CASE WHEN days=0 THEN 'free' ELSE cfg->>'trialPlanCode' END;
 SELECT id INTO pid FROM plans WHERE plans.code=chosen_code AND is_active;
 IF pid IS NULL THEN RAISE EXCEPTION 'Registration plan unavailable';END IF;
 INSERT INTO subscriptions(tenant_id,plan_id,status,trial_ends_at) VALUES(tid,pid,CASE WHEN days=0 THEN 'active' ELSE 'trialing' END,CASE WHEN days=0 THEN NULL ELSE now()+make_interval(days=>days) END);
 INSERT INTO platform_audit_logs(actor_id,action,tenant_id,details) VALUES(uid,'company.registered',tid,jsonb_build_object('plan',chosen_code,'trialDays',days,'source','self_registration'));
END $$;
REVOKE ALL ON FUNCTION saas_registration_settings(integer),platform_set_registration_policy(uuid,boolean,text,integer,text),saas_registration_record(uuid,uuid,integer) FROM PUBLIC,app_user,boat_platform;
GRANT EXECUTE ON FUNCTION saas_registration_settings(integer) TO app_user,boat_platform;
GRANT EXECUTE ON FUNCTION platform_set_registration_policy(uuid,boolean,text,integer,text) TO boat_platform;
GRANT EXECUTE ON FUNCTION saas_registration_record(uuid,uuid,integer) TO app_user;
-- Do not disable the free fallback or the configured trial plan.
CREATE FUNCTION saas_protect_registration_plan() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF OLD.is_active AND NOT NEW.is_active AND (OLD.code='free' OR OLD.code=COALESCE((SELECT trial_plan_code FROM saas_registration_policy WHERE singleton),'pro')) THEN RAISE EXCEPTION 'Plan used by registration policy';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER saas_protect_registration_plan BEFORE UPDATE OF is_active ON plans FOR EACH ROW EXECUTE FUNCTION saas_protect_registration_plan();
