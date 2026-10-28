-- Additive: existing deals and their workflow remain intact.
ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS expected_close date;
