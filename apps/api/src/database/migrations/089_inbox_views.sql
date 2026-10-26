-- Independent conversation views; blocking is scoped to a contact on one channel.
ALTER TABLE conversations ADD COLUMN important boolean NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN archived_at timestamptz;
ALTER TABLE contact_channels ADD COLUMN blocked_at timestamptz;
CREATE INDEX conversations_important_recent ON conversations(tenant_id,last_message_at DESC) WHERE important;
CREATE INDEX conversations_archived_recent ON conversations(tenant_id,last_message_at DESC) WHERE archived_at IS NOT NULL;
