-- A click is "errored" when the flow run that followed it ended in an error.
ALTER TABLE flow_button_clicks ADD COLUMN errored boolean NOT NULL DEFAULT false;
