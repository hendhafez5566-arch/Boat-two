ALTER TABLE ai_providers ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE ai_providers ADD COLUMN retired_at timestamptz;
ALTER TABLE ai_providers ADD COLUMN supports_tools boolean NOT NULL DEFAULT true;
ALTER TABLE ai_providers ADD CONSTRAINT retired_provider_disabled CHECK(retired_at IS NULL OR NOT enabled);
