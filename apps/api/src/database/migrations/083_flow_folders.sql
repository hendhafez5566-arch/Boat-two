ALTER TABLE flows ADD COLUMN folder_name text CHECK(folder_name IS NULL OR length(folder_name) BETWEEN 1 AND 80);
CREATE INDEX flows_folder_idx ON flows(tenant_id,folder_name);
