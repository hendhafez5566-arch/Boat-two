-- Per-node delivery statistics: outbound bot messages remember which flow and node produced them.
ALTER TABLE messages ADD COLUMN flow_id uuid;
ALTER TABLE messages ADD COLUMN flow_node_id text;
CREATE INDEX messages_flow_node_idx ON messages (tenant_id, flow_id, flow_node_id) WHERE flow_id IS NOT NULL;
