-- Durable tenant-scoped order notifications, published by the existing post-commit stream.
CREATE FUNCTION record_commerce_order_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO realtime_events(tenant_id,payload)
    VALUES (NEW.tenant_id,'{"type":"orders_changed"}'::jsonb);
  ELSIF OLD.status IS DISTINCT FROM NEW.status OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO realtime_events(tenant_id,payload)
    VALUES (NEW.tenant_id,'{"type":"orders_changed"}'::jsonb);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER commerce_orders_realtime
AFTER INSERT OR UPDATE OF status, assigned_to ON commerce_orders
FOR EACH ROW EXECUTE FUNCTION record_commerce_order_change();
