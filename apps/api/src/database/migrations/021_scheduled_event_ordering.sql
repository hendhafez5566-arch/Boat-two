-- Future follow-ups must not block immediate events for the same contact.
CREATE OR REPLACE FUNCTION event_due(p_limit int) RETURNS TABLE(id uuid,tenant_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT e.id,e.tenant_id FROM domain_events e WHERE e.status='pending' AND e.available_at<=now() AND NOT EXISTS(SELECT 1 FROM domain_events prior WHERE prior.tenant_id=e.tenant_id AND prior.aggregate_id=e.aggregate_id AND prior.seq<e.seq AND prior.status<>'completed' AND (prior.available_at<=now() OR prior.status='failed')) ORDER BY e.seq LIMIT LEAST(GREATEST(p_limit,1),100)
$$;
