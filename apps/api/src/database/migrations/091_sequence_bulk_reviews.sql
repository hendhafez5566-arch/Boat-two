ALTER TABLE sequences ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
CREATE TABLE sequence_bulk_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 sequence_id uuid NOT NULL,created_by uuid NOT NULL REFERENCES users(id),sequence_revision integer NOT NULL,
 audience jsonb NOT NULL,contact_ids uuid[] NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',consumed_at timestamptz,result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,sequence_id) REFERENCES sequences(tenant_id,id) ON DELETE CASCADE
);
ALTER TABLE sequence_bulk_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_bulk_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sequence_bulk_reviews USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON sequence_bulk_reviews TO app_user;
CREATE INDEX sequence_bulk_reviews_expiry ON sequence_bulk_reviews(expires_at);
