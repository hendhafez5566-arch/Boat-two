ALTER TABLE billing_invoices ADD COLUMN paid_at timestamptz;
CREATE INDEX billing_paid_at ON billing_invoices(paid_at) WHERE paid_at IS NOT NULL;
CREATE FUNCTION platform_operational_report(date_from timestamptz,date_to timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF date_to<=date_from OR date_to-date_from>interval '366 days' THEN RAISE EXCEPTION 'Invalid report range';END IF;
 RETURN jsonb_build_object(
 'from',date_from,'to',date_to,
 'paidInvoicesByCurrency',(SELECT COALESCE(jsonb_agg(r),'[]') FROM (SELECT currency,count(*)::int AS invoices,sum(amount_paid)::text AS gross_paid_minor_units FROM billing_invoices WHERE status='paid' AND paid_at>=date_from AND paid_at<date_to GROUP BY currency ORDER BY currency) r),
 'invoiceCohortByCurrency',(SELECT COALESCE(jsonb_agg(r),'[]') FROM (SELECT currency,count(*)::int AS invoices,sum(amount_due)::text AS due_minor_units,sum(amount_remaining)::text AS remaining_minor_units,count(*) FILTER(WHERE payment_failed AND status='open')::int AS failed_open FROM billing_invoices WHERE to_timestamp(provider_created)>=date_from AND to_timestamp(provider_created)<date_to GROUP BY currency ORDER BY currency) r),
 'paidInvoicesMissingPaymentDate',(SELECT count(*)::int FROM billing_invoices WHERE status='paid' AND paid_at IS NULL),
 'recurringByCurrency',(SELECT COALESCE(jsonb_agg(r),'[]') FROM (SELECT b.currency,s.status,count(*)::int AS subscriptions,sum(CASE WHEN b.interval='year' THEN b.amount_cents::numeric/12 ELSE b.amount_cents END)::text AS monthly_equivalent_minor_units FROM subscriptions s JOIN billing_prices b ON b.provider_id=s.stripe_current_price_id WHERE s.status IN('active','past_due') GROUP BY b.currency,s.status ORDER BY b.currency,s.status) r),
 'unpricedLinkedSubscriptions',(SELECT count(*)::int FROM subscriptions s WHERE s.stripe_subscription_id IS NOT NULL AND s.status IN('active','past_due') AND NOT EXISTS(SELECT 1 FROM billing_prices b WHERE b.provider_id=s.stripe_current_price_id)),
 'companies',(SELECT jsonb_build_object('total',count(*),'suspended',count(*) FILTER(WHERE suspended_at IS NOT NULL)) FROM tenants),
 'subscriptions',(SELECT COALESCE(jsonb_object_agg(status,n),'{}') FROM (SELECT status,count(*)::int n FROM subscriptions GROUP BY status) r),
 'queues',jsonb_build_object(
 'eventsPending',(SELECT count(*) FROM domain_events WHERE status='pending' AND available_at<=now()),
 'eventsFailed',(SELECT count(*) FROM domain_events WHERE status='failed'),
 'deliveryAmbiguous',(SELECT count(*) FROM outbound_jobs WHERE status='ambiguous'),
 'billingBlocked',(SELECT count(*) FROM billing_reconciliations WHERE status='blocked'),
 'subscriptionChangesAmbiguous',(SELECT count(*) FROM billing_subscription_requests WHERE status='ambiguous'),
 'requestedDomains',(SELECT count(*) FROM workspace_domains WHERE hosting_enabled),
 'domainOwnershipExpired',(SELECT count(*) FROM workspace_domains WHERE hosting_enabled AND (verified_at IS NULL OR verified_at<=now()-interval '24 hours')))
 );
END $$;
REVOKE ALL ON FUNCTION platform_operational_report(timestamptz,timestamptz) FROM PUBLIC,app_user;
GRANT EXECUTE ON FUNCTION platform_operational_report(timestamptz,timestamptz) TO boat_platform;
