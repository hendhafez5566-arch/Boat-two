CREATE TABLE commerce_order_documents (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  slot smallint NOT NULL CHECK (slot BETWEEN 0 AND 19),
  filename text NOT NULL,
  mime text NOT NULL CHECK (mime IN ('application/pdf','image/jpeg','image/png')),
  bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 2097152),
  PRIMARY KEY (tenant_id,order_id,slot),
  FOREIGN KEY (tenant_id,order_id) REFERENCES commerce_orders(tenant_id,id) ON DELETE CASCADE
);
ALTER TABLE commerce_order_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_order_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY commerce_order_documents_tenant ON commerce_order_documents
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE(filename,mime,bytes) ON commerce_order_documents TO app_user;
