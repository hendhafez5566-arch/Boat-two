ALTER TABLE catalog_products
  ADD COLUMN specifications jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(specifications) = 'array'),
  ADD COLUMN options jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(options) = 'array');
