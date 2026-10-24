ALTER TABLE crm_jobs DROP CONSTRAINT crm_jobs_status_check;
ALTER TABLE crm_jobs ADD CONSTRAINT crm_jobs_status_check CHECK(status IN ('uploading','pending','running','completed','canceled'));
ALTER TABLE crm_jobs ADD COLUMN uploaded integer NOT NULL DEFAULT 0 CHECK(uploaded>=0 AND uploaded<=total);
CREATE TABLE crm_import_rows (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,ordinal integer NOT NULL CHECK(ordinal>0),payload jsonb NOT NULL,
 PRIMARY KEY(tenant_id,job_id,ordinal),FOREIGN KEY(tenant_id,job_id) REFERENCES crm_jobs(tenant_id,id) ON DELETE CASCADE
);
ALTER TABLE crm_import_rows ENABLE ROW LEVEL SECURITY;ALTER TABLE crm_import_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm_import_rows USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT ON crm_import_rows TO app_user;
CREATE OR REPLACE FUNCTION crm_expire_export_rows() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.expired_at IS NOT NULL THEN
  DELETE FROM crm_export_rows WHERE tenant_id=NEW.tenant_id AND job_id=NEW.id;
  DELETE FROM crm_import_rows WHERE tenant_id=NEW.tenant_id AND job_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
