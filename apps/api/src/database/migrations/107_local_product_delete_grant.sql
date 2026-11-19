-- Explicitly allow tenant-RLS-protected local product deletion after dependency checks.
-- No existing products or categories are changed by this migration.
GRANT DELETE ON catalog_products TO app_user;
