ALTER TABLE invitation_mail_jobs ADD COLUMN delivery_status text CHECK(delivery_status IN ('delivered','bounced','failed'));
ALTER TABLE invitation_mail_jobs ADD COLUMN delivery_event_at timestamptz;
ALTER TABLE invitation_mail_jobs ADD CONSTRAINT invitation_mail_jobs_tenant_unique UNIQUE(tenant_id,id);
CREATE TABLE mail_receipts(tenant_id uuid NOT NULL REFERENCES tenants(id),event_id text NOT NULL,job_id uuid NOT NULL,provider_id text NOT NULL,status text NOT NULL CHECK(status IN ('delivered','bounced','failed')),occurred_at timestamptz NOT NULL,body_hash text NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,event_id),FOREIGN KEY(tenant_id,job_id) REFERENCES invitation_mail_jobs(tenant_id,id));
ALTER TABLE mail_receipts ENABLE ROW LEVEL SECURITY;ALTER TABLE mail_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON mail_receipts USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT ON mail_receipts TO app_user;
