ALTER TABLE ai_providers ADD COLUMN input_microusd_per_million bigint CHECK(input_microusd_per_million>=0);
ALTER TABLE ai_providers ADD COLUMN output_microusd_per_million bigint CHECK(output_microusd_per_million>=0);
