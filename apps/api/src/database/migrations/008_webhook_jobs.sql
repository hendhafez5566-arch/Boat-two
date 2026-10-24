CREATE TABLE webhook_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
 dedupe_key text NOT NULL,
 payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','failed')),
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(channel_id,dedupe_key)
);
CREATE INDEX webhook_jobs_due_idx ON webhook_jobs(available_at) WHERE status IN ('pending','processing');
ALTER TABLE webhook_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON webhook_jobs USING (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_jobs TO app_user;
CREATE FUNCTION webhook_claim_jobs(p_limit integer) RETURNS TABLE(id uuid, tenant_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE webhook_jobs j SET status='processing', attempts=j.attempts+1, lease_until=now()+interval '90 seconds', updated_at=now()
 WHERE j.id IN (SELECT q.id FROM webhook_jobs q WHERE (q.status='pending' AND q.available_at<=now()) OR (q.status='processing' AND q.lease_until<now()) ORDER BY q.available_at LIMIT LEAST(GREATEST(p_limit,1),50) FOR UPDATE SKIP LOCKED)
 RETURNING j.id,j.tenant_id
$$;
REVOKE ALL ON FUNCTION webhook_claim_jobs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webhook_claim_jobs(integer) TO app_user;
