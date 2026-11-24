ALTER TABLE commerce_orders DROP CONSTRAINT commerce_orders_status_check,
  ADD CONSTRAINT commerce_orders_status_check CHECK (
    status IN ('new','review','documents_required','processing','confirmed','completed','cancelled')
  ),
  ADD COLUMN assigned_to uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE commerce_order_events DROP CONSTRAINT commerce_order_events_status_check,
  ADD CONSTRAINT commerce_order_events_status_check CHECK (
    status IN ('new','review','documents_required','processing','confirmed','completed','cancelled')
  );

GRANT UPDATE(assigned_to) ON commerce_orders TO app_user;
