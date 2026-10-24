ALTER TABLE platform_mfa ADD COLUMN recovery_pending boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION platform_mfa_begin(uid uuid,encrypted text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF length(encrypted) NOT BETWEEN 50 AND 1000 THEN RAISE EXCEPTION 'Invalid MFA state';END IF;
 INSERT INTO platform_mfa(user_id,secret_enc) VALUES(uid,encrypted) ON CONFLICT(user_id) DO UPDATE SET secret_enc=EXCLUDED.secret_enc,pending_at=now(),last_step=-1 WHERE NOT platform_mfa.enabled AND NOT platform_mfa.recovery_pending;
 IF NOT FOUND THEN RETURN false;END IF;
 INSERT INTO platform_audit_logs(actor_id,action,details) VALUES(uid,'operator.mfa_enrollment_started','{}');
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION platform_mfa_consume(uid uuid,encrypted text,step_number bigint,enroll boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF step_number<0 OR abs(step_number-floor(extract(epoch FROM clock_timestamp())/30))>1 THEN RETURN false;END IF;
 UPDATE platform_mfa SET enabled=true,recovery_pending=false,last_step=step_number WHERE user_id=uid AND secret_enc=encrypted AND last_step<step_number AND ((enroll AND NOT enabled AND pending_at>now()-interval '10 minutes') OR (NOT enroll AND enabled));
 IF NOT FOUND THEN RETURN false;END IF;
 INSERT INTO platform_audit_logs(actor_id,action,details) VALUES(uid,CASE WHEN enroll THEN 'operator.mfa_enabled' ELSE 'operator.login' END,'{}');
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION platform_recover_mfa(actor uuid,hash text,encrypted text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE version integer;
BEGIN
 IF length(encrypted) NOT BETWEEN 50 AND 1000 THEN RAISE EXCEPTION 'Invalid recovery state';END IF;
 PERFORM 1 FROM users WHERE id=actor AND disabled_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 DELETE FROM platform_recovery_codes WHERE user_id=actor AND code_hash=hash;
 IF NOT FOUND THEN RETURN NULL;END IF;
 DELETE FROM platform_recovery_codes WHERE user_id=actor;
 UPDATE users SET session_version=session_version+1 WHERE id=actor RETURNING session_version INTO version;
 UPDATE refresh_tokens SET revoked_at=now() WHERE user_id=actor AND revoked_at IS NULL;
 UPDATE platform_mfa SET secret_enc=encrypted,enabled=false,recovery_pending=true,pending_at=now(),last_step=-1 WHERE user_id=actor;
 INSERT INTO platform_audit_logs(actor_id,action,details) VALUES(actor,'operator.mfa_recovery_started',jsonb_build_object('sessionsRevoked',true,'allBackupCodesInvalidated',true));
 RETURN version;
END $$;
-- Lock the domain before transfer state, matching source revocation and avoiding lock inversion.
CREATE OR REPLACE FUNCTION domain_finish_transfer(transfer_id uuid,proof_hash text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r workspace_domain_transfers;target uuid;actor uuid;
BEGIN
 target:=NULLIF(current_setting('app.tenant_id',true),'')::uuid;actor:=NULLIF(current_setting('app.actor_id',true),'')::uuid;
 SELECT * INTO r FROM workspace_domain_transfers WHERE id=transfer_id;
 IF NOT FOUND OR r.target_tenant_id<>target OR r.status<>'pending' OR r.expires_at<=now() OR r.secret_hash<>proof_hash THEN RAISE EXCEPTION 'Transfer unavailable';END IF;
 PERFORM 1 FROM workspace_domains WHERE id=r.domain_id AND tenant_id=r.source_tenant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Domain ownership changed';END IF;
 SELECT * INTO r FROM workspace_domain_transfers WHERE id=transfer_id FOR UPDATE;
 IF r.status<>'pending' OR r.expires_at<=now() THEN RAISE EXCEPTION 'Transfer unavailable';END IF;
 PERFORM 1 FROM tenants WHERE id=target FOR NO KEY UPDATE;
 IF (SELECT count(*) FROM workspace_domains WHERE tenant_id=target AND status<>'revoked')>=5 THEN RAISE EXCEPTION 'Domain quota reached';END IF;
 -- Ownership changes atomically; target must explicitly request hosting again.
 UPDATE workspace_domains SET tenant_id=target,verification_token=r.verification_token,status='verified',verified_at=now(),hosting_enabled=false,hosting_version=hosting_version+1,hosting_error=NULL WHERE id=r.domain_id;
 UPDATE workspace_domain_transfers SET status='accepted',completed_at=now() WHERE id=r.id;
 INSERT INTO audit_logs(tenant_id,actor_id,action,resource_type,resource_id,details)
 VALUES(r.source_tenant_id,actor,'domain.transferred_out','workspace_domains',r.domain_id::text,jsonb_build_object('transferId',r.id)),
       (target,actor,'domain.transferred_in','workspace_domains',r.domain_id::text,jsonb_build_object('transferId',r.id));
 RETURN r.domain_id;
END $$;
