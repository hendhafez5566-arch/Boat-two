CREATE TABLE billing_request_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),request_id uuid NOT NULL REFERENCES billing_subscription_requests(id),
 actor_id uuid NOT NULL REFERENCES users(id),reason text NOT NULL,request_revision timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','blocked','ready','approved','failed')),
 evidence jsonb,observed_at timestamptz,error text,created_at timestamptz NOT NULL DEFAULT now(),approved_at timestamptz
);
ALTER TABLE billing_request_reviews ENABLE ROW LEVEL SECURITY;ALTER TABLE billing_request_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON billing_request_reviews USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,UPDATE ON billing_request_reviews TO app_user;
CREATE UNIQUE INDEX billing_one_pending_review ON billing_request_reviews(request_id) WHERE status='pending';
CREATE FUNCTION platform_billing_review_queue() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(jsonb_agg(r),'[]') FROM (SELECT q.id,q.tenant_id,t.name AS company,q.kind,q.plan_code,q.status,q.error,q.updated_at,
 (SELECT COALESCE(jsonb_agg(v),'[]') FROM (SELECT id,status,evidence,observed_at,error,created_at FROM billing_request_reviews WHERE request_id=q.id ORDER BY created_at DESC LIMIT 5) v) AS reviews
 FROM billing_subscription_requests q JOIN tenants t ON t.id=q.tenant_id WHERE q.status='ambiguous' ORDER BY q.updated_at DESC LIMIT 100) r
$$;
CREATE FUNCTION platform_request_billing_evidence(actor uuid,rid uuid,why text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r billing_subscription_requests;j uuid;
BEGIN
 IF length(trim(why)) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Reason required';END IF;
 SELECT * INTO r FROM billing_subscription_requests WHERE id=rid AND status='ambiguous' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ambiguous request not found';END IF;
 INSERT INTO billing_request_reviews(tenant_id,request_id,actor_id,reason,request_revision) VALUES(r.tenant_id,r.id,actor,why,r.updated_at) RETURNING id INTO j;
 INSERT INTO domain_events(tenant_id,type,aggregate_id,dedupe_key,payload) VALUES(r.tenant_id,'billing.request.evidence',j::text,'billing.evidence:'||j,jsonb_build_object('reviewId',j));
 INSERT INTO platform_audit_logs(actor_id,action,tenant_id,details) VALUES(actor,'billing.evidence_requested',r.tenant_id,jsonb_build_object('requestId',r.id,'reviewId',j,'reason',why));
 RETURN j;
END $$;
CREATE FUNCTION platform_confirm_billing_evidence(actor uuid,review uuid,why text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e billing_request_reviews;r billing_subscription_requests;
BEGIN
 IF length(trim(why)) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Reason required';END IF;
 SELECT * INTO e FROM billing_request_reviews WHERE id=review;
 IF NOT FOUND THEN RAISE EXCEPTION 'Review unavailable';END IF;
 SELECT * INTO r FROM billing_subscription_requests WHERE id=e.request_id FOR UPDATE;
 SELECT * INTO e FROM billing_request_reviews WHERE id=review FOR UPDATE;
 IF e.status<>'ready' OR (e.observed_at IS NULL OR e.observed_at<now()-interval '15 minutes') OR e.evidence->>'verdict' IS DISTINCT FROM 'satisfied' OR r.status<>'ambiguous' OR r.updated_at<>e.request_revision THEN RAISE EXCEPTION 'Fresh matching evidence required';END IF;
 IF NOT EXISTS(SELECT 1 FROM subscriptions WHERE tenant_id=r.tenant_id AND stripe_customer_id=r.customer_id AND stripe_subscription_id=r.subscription_id) THEN RAISE EXCEPTION 'Subscription link changed';END IF;
 UPDATE billing_subscription_requests SET status='completed',error=NULL,updated_at=now() WHERE id=r.id;
 UPDATE billing_request_reviews SET status='approved',approved_at=now() WHERE id=e.id;
 INSERT INTO platform_audit_logs(actor_id,action,tenant_id,details) VALUES(actor,'billing.ambiguity_resolved',r.tenant_id,jsonb_build_object('requestId',r.id,'reviewId',e.id,'providerRequestId',e.evidence->>'providerRequestId','reason',why,'providerUpdated',false));
END $$;
REVOKE ALL ON FUNCTION platform_billing_review_queue(),platform_request_billing_evidence(uuid,uuid,text),platform_confirm_billing_evidence(uuid,uuid,text) FROM PUBLIC,app_user;
GRANT EXECUTE ON FUNCTION platform_billing_review_queue(),platform_request_billing_evidence(uuid,uuid,text),platform_confirm_billing_evidence(uuid,uuid,text) TO boat_platform;
