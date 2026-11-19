-- Additive lifecycle. Existing names/bytes/records remain untouched.
ALTER TABLE files ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE files ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
CREATE OR REPLACE FUNCTION attachment_is_shared(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM files WHERE name=p_name AND deleted_at IS NULL AND revoked_at IS NULL)
$$;
REVOKE ALL ON FUNCTION attachment_is_shared(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION attachment_is_shared(text) TO app_user;
