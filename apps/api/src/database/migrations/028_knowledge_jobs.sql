CREATE TABLE knowledge_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),source_id uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','blocked','failed','completed','canceled')),
 prepared jsonb NOT NULL DEFAULT '[]',chunks jsonb NOT NULL DEFAULT '[]',processed int NOT NULL DEFAULT 0,total int NOT NULL DEFAULT 0,error text,attempts int NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX knowledge_one_job_idx ON knowledge_jobs(source_id) WHERE status IN ('pending','running','blocked');
CREATE TABLE embedding_usage(tenant_id uuid NOT NULL REFERENCES tenants(id),period date NOT NULL,charged bigint NOT NULL DEFAULT 0,reserved bigint NOT NULL DEFAULT 0,CHECK(charged>=0 AND reserved>=0),PRIMARY KEY(tenant_id,period));
CREATE TABLE embedding_reservations(
 tenant_id uuid NOT NULL REFERENCES tenants(id),effect_key text NOT NULL,period date NOT NULL,amount int NOT NULL CHECK(amount>0),
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','charged','released','uncertain')),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,effect_key)
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['knowledge_jobs','embedding_usage','embedding_reservations'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO app_user',t);
 END LOOP; END $$;
UPDATE plans SET limits=limits || jsonb_build_object('embedding_token_budget',CASE code WHEN 'free' THEN 50000 WHEN 'starter' THEN 500000 WHEN 'pro' THEN 5000000 ELSE 20000000 END);

WITH jobs AS (INSERT INTO knowledge_jobs(tenant_id,source_id) SELECT tenant_id,id FROM knowledge_sources WHERE status IN ('pending','processing') RETURNING id,tenant_id)
INSERT INTO domain_events(tenant_id,type,aggregate_id,dedupe_key,payload) SELECT tenant_id,'knowledge.job',id::text,'knowledge:'||id::text||':0',jsonb_build_object('jobId',id) FROM jobs;
