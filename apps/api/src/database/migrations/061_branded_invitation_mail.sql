CREATE TABLE invitation_mail_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),invitation_id uuid REFERENCES invitations(id) ON DELETE SET NULL,
 payload_enc text,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','blocked','accepted','ambiguous','canceled')),provider_id text,error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,invitation_id));
ALTER TABLE invitation_mail_jobs ENABLE ROW LEVEL SECURITY;ALTER TABLE invitation_mail_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invitation_mail_jobs USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON invitation_mail_jobs TO app_user;
CREATE TRIGGER audit_core AFTER INSERT OR UPDATE ON invitation_mail_jobs FOR EACH ROW EXECUTE FUNCTION audit_core_change();
