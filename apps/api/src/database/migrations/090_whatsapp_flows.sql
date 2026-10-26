CREATE TABLE whatsapp_flows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
 name text NOT NULL, categories text[] NOT NULL,
 definition jsonb, provider_id text, waba_id text,
 provider_status text NOT NULL DEFAULT 'LOCAL_DRAFT',
 validation_errors jsonb NOT NULL DEFAULT '[]',
 uploaded_hash text,
 operation text CHECK(operation IN ('create','upload','publish','deprecate')),
 operation_state text CHECK(operation_state IN ('running','unknown')),
 operation_id uuid, operation_started_at timestamptz,
 error text, archived_at timestamptz,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(channel_id,provider_id),
 CHECK((operation IS NULL AND operation_state IS NULL AND operation_id IS NULL) OR (operation IS NOT NULL AND operation_state IS NOT NULL AND operation_id IS NOT NULL))
);
ALTER TABLE whatsapp_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_flows FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON whatsapp_flows USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON whatsapp_flows TO app_user;
CREATE INDEX whatsapp_flows_account_recent ON whatsapp_flows(channel_id,updated_at DESC) WHERE archived_at IS NULL;
