ALTER TABLE automation_failures ADD COLUMN action_path text;
ALTER TABLE automation_failures ADD COLUMN action_type text;
ALTER TABLE automation_failures ADD COLUMN rule_revision integer;
