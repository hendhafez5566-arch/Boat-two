ALTER TABLE integration_secrets ADD COLUMN auth_type text NOT NULL DEFAULT 'bearer' CHECK(auth_type IN ('bearer','basic','header','hmac_sha256'));
ALTER TABLE integration_secrets ADD COLUMN header_name text;
ALTER TABLE integration_secrets ADD CONSTRAINT integration_header_policy CHECK((auth_type='header' AND header_name IN ('X-API-Key','X-Auth-Token','Api-Key')) OR (auth_type<>'header' AND header_name IS NULL));
