CREATE TABLE ai_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  auto_reply boolean NOT NULL DEFAULT false,
  business_name text,
  instructions text,
  tone text NOT NULL DEFAULT 'friendly' CHECK (tone IN ('friendly','professional','concise')),
  language text NOT NULL DEFAULT 'auto' CHECK (language IN ('auto','ar','en')),
  handoff_enabled boolean NOT NULL DEFAULT true,
  fallback_message text NOT NULL DEFAULT 'عذراً، لا أستطيع الرد الآن. سيتواصل معك أحد موظفينا قريباً.',
  handoff_message text NOT NULL DEFAULT 'سأحوّلك الآن إلى أحد موظفينا.',
  max_history integer NOT NULL DEFAULT 10 CHECK (max_history BETWEEN 2 AND 30),
  temperature numeric(2,1) NOT NULL DEFAULT 0.3 CHECK (temperature BETWEEN 0 AND 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('text','faq','url','file')),
  title text NOT NULL,
  source_ref text,
  content text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','failed')),
  error text,
  char_count integer NOT NULL DEFAULT 0,
  chunk_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_sources_tenant_idx ON knowledge_sources(tenant_id);

CREATE TABLE knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  search_text text NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', search_text)) STORED,
  embedding vector(1536) NOT NULL
);
CREATE INDEX knowledge_chunks_source_idx ON knowledge_chunks(source_id);
CREATE INDEX knowledge_chunks_tsv_idx ON knowledge_chunks USING gin(tsv);
CREATE INDEX knowledge_chunks_embedding_idx ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE ai_usage (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period date NOT NULL,
  replies integer NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, period)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_settings','knowledge_sources','knowledge_chunks','ai_usage'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t);
  END LOOP;
END $$;

-- عقدة ai_reply تحتاج نوع انتظار جديد
ALTER TABLE flow_sessions DROP CONSTRAINT IF EXISTS flow_sessions_wait_kind_check;
ALTER TABLE flow_sessions ADD CONSTRAINT flow_sessions_wait_kind_check CHECK (wait_kind IN ('choice','answer','delay','ai'));

-- حد عدد مصادر المعرفة لكل باقة (-1 = غير محدود)
UPDATE plans SET limits = limits || '{"knowledge_sources":3}'  WHERE code = 'free';
UPDATE plans SET limits = limits || '{"knowledge_sources":20}' WHERE code = 'starter';
UPDATE plans SET limits = limits || '{"knowledge_sources":100}' WHERE code = 'pro';
UPDATE plans SET limits = limits || '{"knowledge_sources":-1}' WHERE code = 'business';

GRANT SELECT, INSERT, UPDATE, DELETE ON ai_settings, knowledge_sources, knowledge_chunks, ai_usage TO app_user;
