CREATE TABLE plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  interval text NOT NULL DEFAULT 'month',
  limits jsonb NOT NULL DEFAULT '{}',
  features jsonb NOT NULL DEFAULT '{}',
  stripe_price_id text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

-- -1 تعني غير محدود
INSERT INTO plans (code, name, price_cents, limits, features, sort_order) VALUES
 ('free', 'Free', 0,
  '{"agents":1,"contacts":100,"messages_per_month":500,"channels":1,"flows":3,"ai_credits":50}',
  '{"white_label":false,"api_access":false,"broadcasts":false}', 0),
 ('starter', 'Starter', 1900,
  '{"agents":3,"contacts":2000,"messages_per_month":10000,"channels":2,"flows":20,"ai_credits":1000}',
  '{"white_label":false,"api_access":false,"broadcasts":true}', 1),
 ('pro', 'Pro', 4900,
  '{"agents":10,"contacts":20000,"messages_per_month":100000,"channels":4,"flows":100,"ai_credits":10000}',
  '{"white_label":false,"api_access":true,"broadcasts":true}', 2),
 ('business', 'Business', 14900,
  '{"agents":-1,"contacts":-1,"messages_per_month":-1,"channels":-1,"flows":-1,"ai_credits":100000}',
  '{"white_label":true,"api_access":true,"broadcasts":true}', 3);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id),
  status text NOT NULL CHECK (status IN ('trialing','active','past_due','canceled')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens(user_id);

CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','agent')),
  token_hash text NOT NULL UNIQUE,
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invitations_tenant_idx ON invitations(tenant_id);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON subscriptions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invitations
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- دوال تتجاوز RLS بشكل محدود، لأن تسجيل الدخول وقبول الدعوة يحدثان قبل معرفة الشركة
CREATE FUNCTION auth_user_memberships(p_user uuid)
RETURNS TABLE (tenant_id uuid, role text, name text, slug text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT m.tenant_id, m.role, t.name, t.slug
  FROM memberships m JOIN tenants t ON t.id = m.tenant_id
  WHERE m.user_id = p_user
  ORDER BY m.created_at
$$;

CREATE FUNCTION auth_find_invitation(p_hash text)
RETURNS TABLE (id uuid, tenant_id uuid, email text, role text, expires_at timestamptz, accepted_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.tenant_id, i.email, i.role, i.expires_at, i.accepted_at
  FROM invitations i WHERE i.token_hash = p_hash
$$;

REVOKE ALL ON FUNCTION auth_user_memberships(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_find_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_user_memberships(uuid) TO app_user;
GRANT EXECUTE ON FUNCTION auth_find_invitation(text) TO app_user;

GRANT SELECT ON plans TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON subscriptions, refresh_tokens, invitations TO app_user;
