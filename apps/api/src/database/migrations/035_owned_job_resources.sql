ALTER TABLE knowledge_sources ADD CONSTRAINT knowledge_sources_tenant_id_unique UNIQUE(tenant_id,id);
ALTER TABLE knowledge_jobs ADD CONSTRAINT knowledge_jobs_source_tenant_fk FOREIGN KEY(tenant_id,source_id) REFERENCES knowledge_sources(tenant_id,id) ON DELETE CASCADE;
ALTER TABLE channel_delivery_policy ADD CONSTRAINT delivery_policy_channel_tenant_fk FOREIGN KEY(tenant_id,channel_id) REFERENCES channels(tenant_id,id);
