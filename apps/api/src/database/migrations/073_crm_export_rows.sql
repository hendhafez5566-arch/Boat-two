-- Frozen export payloads live in ordinal rows, not a repeatedly rewritten growing job JSON.
ALTER TABLE crm_jobs ADD CONSTRAINT crm_jobs_tenant_id_key UNIQUE(tenant_id,id);
CREATE TABLE crm_export_rows (
 tenant_id uuid NOT NULL,
 job_id uuid NOT NULL,
 ordinal integer NOT NULL CHECK(ordinal>0),
 payload jsonb NOT NULL,
 PRIMARY KEY(tenant_id,job_id,ordinal),
 FOREIGN KEY(tenant_id,job_id) REFERENCES crm_jobs(tenant_id,id) ON DELETE CASCADE
);
ALTER TABLE crm_export_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_export_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm_export_rows USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT ON crm_export_rows TO app_user;
CREATE FUNCTION crm_expire_export_rows() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.expired_at IS NOT NULL THEN
  DELETE FROM crm_export_rows WHERE tenant_id=NEW.tenant_id AND job_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION crm_expire_export_rows() FROM PUBLIC;
CREATE TRIGGER expire_export_rows AFTER UPDATE OF expired_at ON crm_jobs FOR EACH ROW WHEN(NEW.expired_at IS NOT NULL) EXECUTE FUNCTION crm_expire_export_rows();
