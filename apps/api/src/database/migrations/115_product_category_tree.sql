ALTER TABLE product_categories ADD COLUMN parent_id uuid;
ALTER TABLE product_categories
  ADD CONSTRAINT product_category_parent
    FOREIGN KEY (tenant_id, parent_id) REFERENCES product_categories (tenant_id, id),
  ADD CONSTRAINT product_category_not_own_parent CHECK (id <> parent_id);

-- Keep the previous uniqueness rule between root categories and apply it to each branch.
CREATE UNIQUE INDEX product_category_root_name ON product_categories (tenant_id, name)
  WHERE parent_id IS NULL;
CREATE UNIQUE INDEX product_category_child_name ON product_categories (tenant_id, parent_id, name)
  WHERE parent_id IS NOT NULL;
ALTER TABLE product_categories DROP CONSTRAINT product_categories_tenant_id_name_key;
