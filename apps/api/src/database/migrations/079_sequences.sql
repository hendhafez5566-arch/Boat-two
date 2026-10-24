-- Sequence campaigns: ordered, delayed messages per contact.
CREATE TABLE sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  channel_id uuid NOT NULL REFERENCES channels(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused')),
  timezone text NOT NULL DEFAULT 'UTC',
  delivery_time text CHECK (delivery_time IS NULL OR delivery_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  stop_on_reply boolean NOT NULL DEFAULT true,
  steps jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE sequence_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sequence_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','stopped')),
  step_index int NOT NULL DEFAULT 0,
  next_run_at timestamptz NOT NULL,
  lease_until timestamptz,
  stop_reason text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, contact_id),
  FOREIGN KEY (tenant_id, sequence_id) REFERENCES sequences(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, contact_id) REFERENCES contacts(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX sequence_enrollments_due_idx ON sequence_enrollments (next_run_at) WHERE status = 'active';
CREATE INDEX sequence_enrollments_contact_idx ON sequence_enrollments (tenant_id, contact_id) WHERE status = 'active';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sequences','sequence_enrollments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
  END LOOP;
END $$;

-- The worker must see due enrollments across tenants; the lease prevents double processing.
CREATE FUNCTION sequence_claim_due(p_limit integer)
RETURNS TABLE (id uuid, tenant_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE sequence_enrollments e
  SET lease_until = now() + interval '60 seconds'
  WHERE e.id IN (
    SELECT x.id FROM sequence_enrollments x
    JOIN sequences s ON s.id = x.sequence_id
    WHERE x.status = 'active' AND s.status = 'active' AND x.next_run_at <= now()
      AND (x.lease_until IS NULL OR x.lease_until < now())
    ORDER BY x.next_run_at
    LIMIT p_limit
    FOR UPDATE OF x SKIP LOCKED
  )
  RETURNING e.id, e.tenant_id
$$;
REVOKE ALL ON FUNCTION sequence_claim_due(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sequence_claim_due(integer) TO app_user;
