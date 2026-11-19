-- Operational abuse counters contain only one-way hashes, never emails/IPs/tokens.
CREATE TABLE auth_rate_limits (
  key_hash text PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  hits integer NOT NULL CHECK (hits > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_rate_limits_expiry ON auth_rate_limits(expires_at);
REVOKE ALL ON auth_rate_limits FROM PUBLIC, app_user;
CREATE FUNCTION auth_consume_rate_limit(p_key text, p_limit integer, p_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE consumed integer;
BEGIN
  IF p_key !~ '^[0-9a-f]{64}$' OR p_limit NOT BETWEEN 1 AND 300 OR p_seconds NOT BETWEEN 1 AND 3600 THEN
    RAISE EXCEPTION 'Invalid abuse counter policy';
  END IF;
  -- Bound cleanup per request; a repeated request cannot extend its locked window.
  DELETE FROM public.auth_rate_limits WHERE key_hash IN (
    SELECT key_hash FROM public.auth_rate_limits WHERE expires_at < now() LIMIT 32
  );
  INSERT INTO public.auth_rate_limits(key_hash,hits,expires_at)
  VALUES(p_key,1,now()+make_interval(secs=>p_seconds))
  ON CONFLICT(key_hash) DO UPDATE SET
    hits=CASE WHEN auth_rate_limits.expires_at<=now() THEN 1 ELSE LEAST(auth_rate_limits.hits+1,p_limit+1) END,
    expires_at=CASE WHEN auth_rate_limits.expires_at<=now() THEN now()+make_interval(secs=>p_seconds) ELSE auth_rate_limits.expires_at END
  RETURNING hits INTO consumed;
  RETURN consumed<=p_limit;
END $$;
REVOKE ALL ON FUNCTION auth_consume_rate_limit(text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_consume_rate_limit(text,integer,integer) TO app_user;
