ALTER TABLE crm_jobs DROP CONSTRAINT crm_jobs_kind_check;
ALTER TABLE crm_jobs ADD CONSTRAINT crm_jobs_kind_check CHECK(kind IN ('import','export','activity_export'));
