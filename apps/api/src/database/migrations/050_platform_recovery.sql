CREATE TABLE platform_recovery_codes(user_id uuid NOT NULL REFERENCES users(id),code_hash text NOT NULL CHECK(code_hash ~ '^[0-9a-f]{64}$'),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,code_hash));
REVOKE ALL ON platform_recovery_codes FROM PUBLIC,app_user,boat_platform;
CREATE FUNCTION platform_replace_recovery_codes(actor uuid,hashes jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h text;
BEGIN
 IF jsonb_typeof(hashes)<>'array' OR jsonb_array_length(hashes)<>8 OR NOT EXISTS(SELECT 1 FROM platform_mfa WHERE user_id=actor AND enabled) THEN RAISE EXCEPTION 'Invalid recovery state';END IF;
 PERFORM 1 FROM users WHERE id=actor FOR UPDATE;
 DELETE FROM platform_recovery_codes WHERE user_id=actor;
 FOR h IN SELECT jsonb_array_elements_text(hashes) LOOP INSERT INTO platform_recovery_codes(user_id,code_hash) VALUES(actor,h);END LOOP;
 INSERT INTO platform_audit_logs(actor_id,action,details) VALUES(actor,'operator.recovery_codes_rotated',jsonb_build_object('count',8));
END $$;
CREATE FUNCTION platform_recover_mfa(actor uuid,hash text,encrypted text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
 UPDATE platform_mfa SET secret_enc=encrypted,enabled=false,pending_at=now(),last_step=-1 WHERE user_id=actor;
 INSERT INTO platform_audit_logs(actor_id,action,details) VALUES(actor,'operator.mfa_recovery_started',jsonb_build_object('sessionsRevoked',true,'allBackupCodesInvalidated',true));
 RETURN version;
END $$;
REVOKE ALL ON FUNCTION platform_replace_recovery_codes(uuid,jsonb),platform_recover_mfa(uuid,text,text) FROM PUBLIC,app_user;
GRANT EXECUTE ON FUNCTION platform_replace_recovery_codes(uuid,jsonb),platform_recover_mfa(uuid,text,text) TO boat_platform;
