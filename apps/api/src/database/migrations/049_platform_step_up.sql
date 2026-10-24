CREATE TABLE platform_step_up_uses(nonce uuid PRIMARY KEY,actor_id uuid NOT NULL REFERENCES users(id),used_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON platform_step_up_uses FROM PUBLIC,app_user,boat_platform;
CREATE FUNCTION platform_consume_step_up(actor uuid,nonce_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- Retain consumed IDs beyond the maximum signed grant lifetime; bounded cleanup.
 DELETE FROM platform_step_up_uses WHERE nonce IN (SELECT nonce FROM platform_step_up_uses WHERE used_at<now()-interval '1 day' LIMIT 100);
 INSERT INTO platform_step_up_uses(nonce,actor_id) VALUES(nonce_id,actor) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN false;END IF;
 INSERT INTO platform_audit_logs(actor_id,action,details) VALUES(actor,'operator.step_up_used','{}');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION platform_consume_step_up(uuid,uuid) FROM PUBLIC,app_user;
GRANT EXECUTE ON FUNCTION platform_consume_step_up(uuid,uuid) TO boat_platform;
