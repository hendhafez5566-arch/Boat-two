ALTER TABLE ai_agents ADD COLUMN allowed_tools text[] NOT NULL DEFAULT '{handoff_to_human}';
