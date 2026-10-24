CREATE TABLE platform_login_limits(key text PRIMARY KEY,window_start timestamptz NOT NULL DEFAULT now(),attempts int NOT NULL DEFAULT 1);
REVOKE ALL ON platform_login_limits FROM PUBLIC,app_user;
CREATE FUNCTION platform_login_gate(login_key text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 WITH updated AS (INSERT INTO platform_login_limits(key) VALUES(login_key)
 ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN platform_login_limits.window_start<now()-interval '15 minutes' THEN 1 ELSE platform_login_limits.attempts+1 END,
 window_start=CASE WHEN platform_login_limits.window_start<now()-interval '15 minutes' THEN now() ELSE platform_login_limits.window_start END RETURNING attempts)
 SELECT attempts<=10 FROM updated
$$;
REVOKE ALL ON FUNCTION platform_login_gate(text) FROM PUBLIC,app_user;
GRANT EXECUTE ON FUNCTION platform_login_gate(text) TO boat_platform;
