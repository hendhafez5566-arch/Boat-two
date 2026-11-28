-- One catalog, including the currently selected immutable billing price.
-- No customer, plan or subscription records are modified.
CREATE VIEW unified_plan_catalog AS
 SELECT p.id,p.code,p.name,p.price_cents,p.currency,p.interval,p.limits,p.features,p.is_active,p.sort_order,
        p.stripe_price_id,
        COALESCE(p.price_cents>0 AND b.active AND b.plan_id=p.id AND b.amount_cents=p.price_cents
         AND b.currency=p.currency AND b.interval=p.interval,false) AS checkout_available
 FROM plans p LEFT JOIN billing_prices b ON b.provider_id=p.stripe_price_id;
REVOKE ALL ON unified_plan_catalog FROM PUBLIC,boat_platform;
GRANT SELECT ON unified_plan_catalog TO app_user;
CREATE FUNCTION platform_plan_catalog() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(jsonb_agg(row ORDER BY sort_order,code),'[]'::jsonb)
 FROM (SELECT code,name,price_cents,currency,interval,limits,features,is_active,checkout_available,sort_order
       FROM unified_plan_catalog) row
$$;
REVOKE ALL ON FUNCTION platform_plan_catalog() FROM PUBLIC,app_user;
GRANT EXECUTE ON FUNCTION platform_plan_catalog() TO boat_platform;
