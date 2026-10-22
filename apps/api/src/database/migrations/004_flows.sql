CREATE TABLE flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  priority integer NOT NULL DEFAULT 0,
  triggers jsonb NOT NULL DEFAULT '[]',
  channel_ids uuid[] NOT NULL DEFAULT '{}',
  draft_graph jsonb NOT NULL,
  published_version_id uuid,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX flows_tenant_idx ON flows(tenant_id);

CREATE TABLE flow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  version integer NOT NULL,
  graph jsonb NOT NULL,
  triggers jsonb NOT NULL,
  channel_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flow_id, version)
);

ALTER TABLE flows
  ADD CONSTRAINT flows_published_version_fk
  FOREIGN KEY (published_version_id) REFERENCES flow_versions(id) ON DELETE SET NULL;

CREATE TABLE flow_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES flow_versions(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('waiting','completed','handed_off','error','expired')),
  state jsonb NOT NULL,
  wait_kind text CHECK (wait_kind IN ('choice','answer','delay')),
  wait_until timestamptz,
  expires_at timestamptz,
  lease_until timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX flow_sessions_one_active ON flow_sessions(conversation_id) WHERE status = 'waiting';
CREATE INDEX flow_sessions_due_idx ON flow_sessions(wait_until) WHERE status = 'waiting' AND wait_kind = 'delay';
CREATE INDEX flow_sessions_flow_idx ON flow_sessions(flow_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['flows','flow_versions','flow_sessions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t);
  END LOOP;
END $$;

-- المُجدوِل يحتاج رؤية الجلسات المستحقة عبر كل الشركات، مع "حجز" (lease) لمنع المعالجة المزدوجة
CREATE FUNCTION flow_claim_due_sessions(p_limit integer)
RETURNS TABLE (id uuid, tenant_id uuid, conversation_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE flow_sessions fs
  SET lease_until = now() + interval '60 seconds'
  WHERE fs.id IN (
    SELECT s.id FROM flow_sessions s
    WHERE s.status = 'waiting' AND s.wait_kind = 'delay' AND s.wait_until <= now()
      AND (s.lease_until IS NULL OR s.lease_until < now())
    ORDER BY s.wait_until
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING fs.id, fs.tenant_id, fs.conversation_id
$$;
REVOKE ALL ON FUNCTION flow_claim_due_sessions(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION flow_claim_due_sessions(integer) TO app_user;

GRANT SELECT, INSERT, UPDATE, DELETE ON flows, flow_versions, flow_sessions TO app_user;
