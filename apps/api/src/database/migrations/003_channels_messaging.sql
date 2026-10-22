CREATE TABLE channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('web','whatsapp','facebook','instagram')),
  name text NOT NULL,
  external_id text NOT NULL,          -- web: مفتاح الويدجت | whatsapp: phone_number_id | facebook: page id | instagram: IG account id
  credentials_enc text,               -- مشفّرة AES-256-GCM
  settings jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (type, external_id)
);
CREATE INDEX channels_tenant_idx ON channels(tenant_id);

CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text,
  phone text,
  email text,
  attributes jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contacts_tenant_idx ON contacts(tenant_id);

CREATE TABLE contact_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, external_id)
);
CREATE INDEX contact_channels_contact_idx ON contact_channels(contact_id);

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','closed')),
  handled_by text NOT NULL DEFAULT 'bot' CHECK (handled_by IN ('bot','human')),
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  unread_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_inbound_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX conversations_one_open ON conversations(channel_id, contact_id) WHERE status <> 'closed';
CREATE INDEX conversations_tenant_last_idx ON conversations(tenant_id, last_message_at DESC);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  sender_type text NOT NULL CHECK (sender_type IN ('contact','bot','agent','system')),
  sender_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL,
  content jsonb NOT NULL,
  external_id text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','queued','sent','delivered','read','failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX messages_channel_external_uniq ON messages(channel_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX messages_conversation_seq_idx ON messages(conversation_id, seq);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['channels','contacts','contact_channels','conversations','messages'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t);
  END LOOP;
END $$;

-- البحث عن القناة من الـ webhook / الويدجت قبل معرفة الشركة
CREATE FUNCTION channel_lookup(p_type text, p_external_id text)
RETURNS TABLE (id uuid, tenant_id uuid, type text, name text, status text, credentials_enc text, settings jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.tenant_id, c.type, c.name, c.status, c.credentials_enc, c.settings
  FROM channels c WHERE c.type = p_type AND c.external_id = p_external_id
$$;
REVOKE ALL ON FUNCTION channel_lookup(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION channel_lookup(text, text) TO app_user;

GRANT SELECT, INSERT, UPDATE, DELETE ON channels, contacts, contact_channels, conversations, messages TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
