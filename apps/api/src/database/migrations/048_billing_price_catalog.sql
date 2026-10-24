CREATE TABLE billing_prices(
 provider_id text PRIMARY KEY CHECK(provider_id ~ '^price_[A-Za-z0-9_]+$'),
 plan_id uuid NOT NULL REFERENCES plans(id),amount_cents integer NOT NULL CHECK(amount_cents>0),
 currency text NOT NULL CHECK(currency ~ '^[a-z]{3}$'),interval text NOT NULL CHECK(interval IN ('month','year')),
 active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),retired_at timestamptz
);
INSERT INTO billing_prices(provider_id,plan_id,amount_cents,currency,interval)
 SELECT stripe_price_id,id,price_cents,currency,interval FROM plans WHERE stripe_price_id IS NOT NULL AND price_cents>0;
GRANT SELECT ON billing_prices TO app_user;
ALTER TABLE subscriptions ADD COLUMN stripe_current_price_id text;
ALTER TABLE subscriptions ADD COLUMN past_due_since timestamptz;
UPDATE subscriptions SET past_due_since=updated_at WHERE status='past_due';
CREATE FUNCTION billing_track_delinquency() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 NEW.past_due_since:=CASE WHEN NEW.status='past_due' THEN COALESCE(OLD.past_due_since,now()) ELSE NULL END;
 RETURN NEW;
END $$;
CREATE TRIGGER billing_delinquency BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION billing_track_delinquency();
CREATE FUNCTION platform_publish_price(actor uuid,pcode text,price text,amount integer,cur text,period text,reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pid uuid;
BEGIN
 IF length(trim(reason))<10 OR amount<=0 OR cur !~ '^[a-z]{3}$' OR period NOT IN ('month','year') OR price !~ '^price_[A-Za-z0-9_]+$' THEN RAISE EXCEPTION 'Invalid price';END IF;
 SELECT id INTO pid FROM plans WHERE code=pcode AND is_active FOR UPDATE;
 IF pid IS NULL OR pcode='free' THEN RAISE EXCEPTION 'Active paid plan required'; END IF;
 INSERT INTO billing_prices(provider_id,plan_id,amount_cents,currency,interval) VALUES(price,pid,amount,cur,period);
 -- The catalog is immutable: publishing selects a new default; existing subscriptions retain their price.
 UPDATE plans SET stripe_price_id=price,price_cents=amount,currency=cur,interval=period WHERE id=pid;
 INSERT INTO platform_audit_logs(actor_id,action,details) VALUES(actor,'price.publish',jsonb_build_object('plan',pcode,'price',price,'amount',amount,'currency',cur,'interval',period,'reason',reason,'providerUpdated',false));
END $$;
CREATE FUNCTION platform_retire_price(actor uuid,price text,reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF length(trim(reason))<10 THEN RAISE EXCEPTION 'Reason required'; END IF;
 UPDATE billing_prices SET active=false,retired_at=COALESCE(retired_at,now()) WHERE provider_id=price;
 IF NOT FOUND THEN RAISE EXCEPTION 'Price not found';END IF;
 UPDATE plans SET stripe_price_id=NULL WHERE stripe_price_id=price;
 INSERT INTO platform_audit_logs(actor_id,action,details) VALUES(actor,'price.retire',jsonb_build_object('price',price,'reason',reason,'providerUpdated',false));
END $$;
CREATE FUNCTION platform_price_catalog() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(jsonb_agg(r),'[]') FROM (SELECT b.*,p.code AS plan_code FROM billing_prices b JOIN plans p ON p.id=b.plan_id ORDER BY b.created_at DESC,b.provider_id LIMIT 500) r
$$;
REVOKE ALL ON FUNCTION platform_publish_price(uuid,text,text,integer,text,text,text),platform_retire_price(uuid,text,text),platform_price_catalog() FROM PUBLIC,app_user;
GRANT EXECUTE ON FUNCTION platform_publish_price(uuid,text,text,integer,text,text,text),platform_retire_price(uuid,text,text),platform_price_catalog() TO boat_platform;
CREATE FUNCTION public_domain_brand(host text,grace_days integer) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('hostname',d.hostname,'name',b.name,'logoUrl',b.logo_url,'primaryColor',b.primary_color,'widgetTitle',b.widget_title)
 FROM workspace_domains d JOIN tenants t ON t.id=d.tenant_id JOIN subscriptions s ON s.tenant_id=t.id JOIN plans p ON p.id=s.plan_id JOIN workspace_branding b ON b.tenant_id=t.id
 WHERE d.hostname=host AND d.status='verified' AND d.hosting_enabled AND d.hosting_error IS NULL AND d.verified_at>now()-interval '24 hours' AND t.suspended_at IS NULL
 AND s.status IN ('active','trialing','past_due') AND NOT(s.status='trialing' AND s.trial_ends_at<now())
 AND NOT(s.status='past_due' AND COALESCE(s.past_due_since,s.updated_at)+make_interval(days=>LEAST(GREATEST(grace_days,0),90))<=now())
 AND COALESCE((p.features->>'white_label')::boolean,false)
$$;
CREATE OR REPLACE FUNCTION public_domain_brand(host text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT public_domain_brand(host,0) $$;
REVOKE ALL ON FUNCTION public_domain_brand(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_domain_brand(text,integer) TO app_user;
