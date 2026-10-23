CREATE INDEX conversations_tenant_tuple_idx ON conversations(tenant_id,last_message_at DESC,id DESC);
