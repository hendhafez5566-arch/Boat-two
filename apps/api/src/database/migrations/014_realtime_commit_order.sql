-- Allocate public replay cursors only AFTER source transactions commit. PostgreSQL
-- sequences alone are not commit ordered; publishing source IDs can lose late commits.
CREATE TABLE stream_events(id bigserial PRIMARY KEY,source_id bigint NOT NULL UNIQUE REFERENCES realtime_events(id) ON DELETE CASCADE,tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX stream_tenant_cursor ON stream_events(tenant_id,id);
ALTER TABLE stream_events ENABLE ROW LEVEL SECURITY;ALTER TABLE stream_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON stream_events USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT ON stream_events TO app_user;
CREATE FUNCTION materialize_realtime(p_limit int) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE n int; BEGIN
 IF NOT pg_try_advisory_xact_lock(734803917) THEN RETURN 0; END IF;
 INSERT INTO stream_events(source_id,tenant_id,payload) SELECT e.id,e.tenant_id,e.payload FROM realtime_events e WHERE NOT EXISTS(SELECT 1 FROM stream_events s WHERE s.source_id=e.id) ORDER BY e.id LIMIT LEAST(GREATEST(p_limit,1),1000) ON CONFLICT(source_id) DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
END $$;
REVOKE ALL ON FUNCTION materialize_realtime(int) FROM PUBLIC;GRANT EXECUTE ON FUNCTION materialize_realtime(int) TO app_user;
