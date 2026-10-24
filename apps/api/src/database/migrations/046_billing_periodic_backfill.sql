ALTER TABLE subscriptions ADD COLUMN next_reconciliation_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE billing_reconciliations ADD COLUMN source text NOT NULL DEFAULT 'owner' CHECK(source IN ('owner','periodic'));
ALTER TABLE billing_reconciliations ADD COLUMN subscription_synced boolean NOT NULL DEFAULT false;
ALTER TABLE billing_reconciliations ADD COLUMN invoice_cursor text;
ALTER TABLE billing_reconciliations ADD COLUMN invoice_pages integer NOT NULL DEFAULT 0;
ALTER TABLE billing_reconciliations ADD COLUMN backfill_complete boolean NOT NULL DEFAULT false;
CREATE INDEX subscriptions_reconcile_due ON subscriptions(next_reconciliation_at) WHERE stripe_subscription_id IS NOT NULL;
-- Bounded scheduler runs on the existing outbox tick; no provider I/O or tenant data is returned.
CREATE FUNCTION billing_schedule_due(p_limit integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; job uuid; n integer := 0;
BEGIN
 FOR s IN SELECT sub.id,sub.tenant_id FROM subscriptions sub JOIN tenants t ON t.id=sub.tenant_id
   WHERE sub.stripe_subscription_id IS NOT NULL AND sub.stripe_customer_id IS NOT NULL
   AND sub.next_reconciliation_at<=now() AND t.suspended_at IS NULL
   ORDER BY sub.next_reconciliation_at,sub.id LIMIT LEAST(GREATEST(p_limit,1),100) FOR UPDATE OF sub SKIP LOCKED
 LOOP
   UPDATE subscriptions SET next_reconciliation_at=now()+interval '12 hours' WHERE id=s.id;
   INSERT INTO billing_reconciliations(tenant_id,source) VALUES(s.tenant_id,'periodic')
     ON CONFLICT(tenant_id) WHERE status='pending' DO NOTHING RETURNING id INTO job;
   IF job IS NOT NULL THEN
     INSERT INTO domain_events(tenant_id,type,aggregate_id,dedupe_key,payload)
       VALUES(s.tenant_id,'billing.reconcile',job::text,'billing.reconcile:'||job,jsonb_build_object('id',job));
     n := n+1;
   END IF;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION billing_schedule_due(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing_schedule_due(integer) TO app_user;
