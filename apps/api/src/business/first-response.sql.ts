/** One sample per conversation: first delivered/sent staff reply after its earliest inbound in range. */
export const FIRST_RESPONSE_SQL = `
WITH inbound AS (
 SELECT DISTINCT ON (conversation_id) conversation_id,created_at AS first_at
 FROM messages
 WHERE direction='in' AND sender_type='contact' AND NOT is_internal
   AND created_at >= $1 AND created_at < $2
 ORDER BY conversation_id,created_at,seq
), responses AS (
 SELECT i.first_at,r.reply_at FROM inbound i
 LEFT JOIN LATERAL (
  SELECT min(created_at) AS reply_at FROM messages
  WHERE conversation_id=i.conversation_id AND direction='out' AND sender_type='agent'
    AND NOT is_internal AND status IN ('sent','delivered','read')
    AND created_at>=i.first_at AND created_at<$2
 ) r ON true
)
SELECT count(*) FILTER(WHERE reply_at IS NOT NULL)::int AS answered,
 count(*) FILTER(WHERE reply_at IS NULL)::int AS unanswered,
 (avg(extract(epoch FROM (reply_at-first_at))*1000) FILTER(WHERE reply_at IS NOT NULL))::double precision AS average_ms
FROM responses`;
