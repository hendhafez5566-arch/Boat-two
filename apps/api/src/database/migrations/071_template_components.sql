-- Preserve the provider's approved structure; legacy rows remain BODY-only.
ALTER TABLE whatsapp_templates ADD COLUMN components jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE whatsapp_templates ADD CONSTRAINT whatsapp_template_components_array CHECK (jsonb_typeof(components)='array');
