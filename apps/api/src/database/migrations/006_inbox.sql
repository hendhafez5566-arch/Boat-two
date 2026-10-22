-- ملاحظات داخلية: لا تُرسل للعميل ولا تُقرأ بواسطة الـ AI أو الويدجت
ALTER TABLE messages ADD COLUMN is_internal boolean NOT NULL DEFAULT false;

-- توفر الموظف للتوزيع التلقائي
ALTER TABLE memberships ADD COLUMN available boolean NOT NULL DEFAULT true;

CREATE TABLE inbox_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  auto_assign boolean NOT NULL DEFAULT false,
  max_open_per_agent integer NOT NULL DEFAULT 15 CHECK (max_open_per_agent BETWEEN 1 AND 500),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE canned_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shortcut text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, shortcut)
);

CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime text NOT NULL,
  size integer NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX files_tenant_idx ON files(tenant_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inbox_settings','canned_replies','files'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t);
  END LOOP;
END $$;

CREATE INDEX conversations_assignee_idx ON conversations(tenant_id, assigned_to) WHERE status <> 'closed';
GRANT SELECT, INSERT, UPDATE, DELETE ON inbox_settings, canned_replies, files TO app_user;
