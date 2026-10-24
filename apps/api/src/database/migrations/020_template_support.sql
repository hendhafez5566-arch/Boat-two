ALTER TABLE whatsapp_templates ADD COLUMN supported boolean NOT NULL DEFAULT true;
-- Previously synchronized provider variants were not structurally classified.
-- Require a fresh sync before sending historical provider-backed records.
UPDATE whatsapp_templates SET supported=false WHERE provider_id IS NOT NULL;
