-- A bulk tenant must not monopolize every worker discovery batch.
-- Preserve per-aggregate predecessor gating; interleave eligible tenants before older siblings.
CREATE OR REPLACE FUNCTION event_due(p_limit int) RETURNS TABLE(id uuid,tenant_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 WITH eligible AS (
  SELECT e.id,e.tenant_id,e.seq,row_number() OVER(PARTITION BY e.tenant_id ORDER BY e.seq) AS tenant_round
  FROM domain_events e
  WHERE e.status='pending' AND e.available_at<=now()
   AND NOT EXISTS(
    SELECT 1 FROM domain_events prior
    WHERE prior.tenant_id=e.tenant_id AND prior.aggregate_id=e.aggregate_id AND prior.seq<e.seq
      AND prior.status<>'completed' AND (prior.available_at<=now() OR prior.status='failed')
   )
 )
 SELECT e.id,e.tenant_id FROM eligible e ORDER BY e.tenant_round,e.seq
 LIMIT LEAST(GREATEST(p_limit,1),100)
$$;
