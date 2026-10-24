CREATE TABLE platform_mfa(user_id uuid PRIMARY KEY REFERENCES users(id),secret_enc text NOT NULL,enabled boolean NOT NULL DEFAULT false,pending_at timestamptz NOT NULL DEFAULT now(),last_step bigint NOT NULL DEFAULT -1);
REVOKE ALL ON platform_mfa FROM PUBLIC,app_user,boat_platform;
CREATE FUNCTION platform_mfa_state(uid uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('secret_enc',secret_enc,'enabled',enabled,'pending_at',pending_at,'last_step',last_step) FROM platform_mfa WHERE user_id=uid
$$;
CREATE FUNCTION platform_mfa_begin(uid uuid,encrypted text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF length(encrypted) NOT BETWEEN 50 AND 1000 THEN RAISE EXCEPTION 'Invalid MFA state';END IF;
 INSERT INTO platform_mfa(user_id,secret_enc) VALUES(uid,encrypted) ON CONFLICT(user_id) DO UPDATE SET secret_enc=EXCLUDED.secret_enc,pending_at=now(),last_step=-1 WHERE NOT platform_mfa.enabled;
 IF NOT FOUND THEN RETURN false;END IF;
 INSERT INTO platform_audit_logs(actor_id,action,details) VALUES(uid,'operator.mfa_enrollment_started','{}');
 RETURN true;
END $$;
CREATE FUNCTION platform_mfa_consume(uid uuid,encrypted text,step_number bigint,enroll boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF step_number<0 OR abs(step_number-floor(extract(epoch FROM clock_timestamp())/30))>1 THEN RETURN false;END IF;
 UPDATE platform_mfa SET enabled=true,last_step=step_number WHERE user_id=uid AND secret_enc=encrypted AND last_step<step_number AND ((enroll AND NOT enabled AND pending_at>now()-interval '10 minutes') OR (NOT enroll AND enabled));
 IF NOT FOUND THEN RETURN false;END IF;
 INSERT INTO platform_audit_logs(actor_id,action,details) VALUES(uid,CASE WHEN enroll THEN 'operator.mfa_enabled' ELSE 'operator.login' END,'{}');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION platform_mfa_state(uuid),platform_mfa_begin(uuid,text),platform_mfa_consume(uuid,text,bigint,boolean) FROM PUBLIC,app_user;
GRANT EXECUTE ON FUNCTION platform_mfa_state(uuid),platform_mfa_begin(uuid,text),platform_mfa_consume(uuid,text,bigint,boolean) TO boat_platform;
