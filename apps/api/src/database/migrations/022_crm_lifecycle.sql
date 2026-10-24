-- Preserve merged records and historical recipient IDs; never delete customer history.
ALTER TABLE contacts ADD COLUMN archived_at timestamptz;
ALTER TABLE contacts ADD COLUMN merged_into_id uuid;
ALTER TABLE contacts ADD CONSTRAINT contacts_merge_tenant_fk FOREIGN KEY(tenant_id,merged_into_id) REFERENCES contacts(tenant_id,id);
ALTER TABLE contacts ADD CONSTRAINT contacts_no_self_merge CHECK(merged_into_id IS NULL OR merged_into_id<>id);
CREATE FUNCTION normalize_contact_phone(value text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT NULLIF(regexp_replace(regexp_replace(translate(value,'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[^0-9]','','g'),'^00',''), '')
$$;
CREATE INDEX contacts_normalized_phone_idx ON contacts(tenant_id,normalize_contact_phone(phone)) WHERE merged_into_id IS NULL;
CREATE INDEX contacts_active_idx ON contacts(tenant_id,created_at DESC,id) WHERE archived_at IS NULL AND merged_into_id IS NULL;
ALTER TABLE campaign_recipients ADD COLUMN canonical_contact_id uuid;
UPDATE campaign_recipients SET canonical_contact_id=contact_id;
ALTER TABLE campaign_recipients ALTER COLUMN canonical_contact_id SET NOT NULL;
ALTER TABLE campaign_recipients ADD CONSTRAINT recipient_canonical_tenant_fk FOREIGN KEY(tenant_id,canonical_contact_id) REFERENCES contacts(tenant_id,id);
CREATE FUNCTION recipient_canonical_default() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.canonical_contact_id=COALESCE(NEW.canonical_contact_id,NEW.contact_id); RETURN NEW; END $$;
CREATE TRIGGER recipient_canonical BEFORE INSERT ON campaign_recipients FOR EACH ROW EXECUTE FUNCTION recipient_canonical_default();
CREATE INDEX recipients_canonical_frequency_idx ON campaign_recipients(tenant_id,canonical_contact_id,updated_at);
CREATE TRIGGER audit_crm_contacts AFTER UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION audit_core_change();
