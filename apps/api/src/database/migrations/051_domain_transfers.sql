CREATE TABLE workspace_domain_transfers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),domain_id uuid NOT NULL REFERENCES workspace_domains(id),
 source_tenant_id uuid NOT NULL REFERENCES tenants(id),target_tenant_id uuid NOT NULL REFERENCES tenants(id),
 hostname text NOT NULL,secret_hash text NOT NULL CHECK(secret_hash ~ '^[0-9a-f]{64}$'),verification_token text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','canceled')),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 CHECK(source_tenant_id<>target_tenant_id)
);
ALTER TABLE workspace_domain_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_domain_transfers FORCE ROW LEVEL SECURITY;
CREATE POLICY transfer_parties ON workspace_domain_transfers USING(NULLIF(current_setting('app.tenant_id',true),'')::uuid IN(source_tenant_id,target_tenant_id)) WITH CHECK(source_tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT ON workspace_domain_transfers TO app_user;
CREATE UNIQUE INDEX domain_one_pending_transfer ON workspace_domain_transfers(domain_id) WHERE status='pending';
CREATE FUNCTION domain_finish_transfer(transfer_id uuid,proof_hash text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r workspace_domain_transfers;target uuid;actor uuid;
BEGIN
 target:=NULLIF(current_setting('app.tenant_id',true),'')::uuid;actor:=NULLIF(current_setting('app.actor_id',true),'')::uuid;
 SELECT * INTO r FROM workspace_domain_transfers WHERE id=transfer_id FOR UPDATE;
 IF NOT FOUND OR r.target_tenant_id<>target OR r.status<>'pending' OR r.expires_at<=now() OR r.secret_hash<>proof_hash THEN RAISE EXCEPTION 'Transfer unavailable';END IF;
 PERFORM 1 FROM workspace_domains WHERE id=r.domain_id AND tenant_id=r.source_tenant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Domain ownership changed';END IF;
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
CREATE FUNCTION domain_cancel_transfer(transfer_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tid uuid;BEGIN
 tid:=NULLIF(current_setting('app.tenant_id',true),'')::uuid;
 UPDATE workspace_domain_transfers SET status='canceled',completed_at=now() WHERE id=transfer_id AND source_tenant_id=tid AND status='pending';
 IF NOT FOUND THEN RETURN false;END IF;
 INSERT INTO audit_logs(tenant_id,actor_id,action,resource_type,resource_id) VALUES(tid,NULLIF(current_setting('app.actor_id',true),'')::uuid,'domain.transfer_canceled','workspace_domain_transfers',transfer_id::text);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION domain_finish_transfer(uuid,text),domain_cancel_transfer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain_finish_transfer(uuid,text),domain_cancel_transfer(uuid) TO app_user;
