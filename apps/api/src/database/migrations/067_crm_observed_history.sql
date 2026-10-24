CREATE TABLE crm_history_epoch(started_at timestamptz NOT NULL);
INSERT INTO crm_history_epoch VALUES(clock_timestamp());
GRANT SELECT ON crm_history_epoch TO app_user;
CREATE TABLE crm_contact_changes(id bigserial PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES tenants(id),contact_id uuid NOT NULL,snapshot jsonb NOT NULL,deleted boolean NOT NULL);
CREATE TABLE crm_contact_history(change_id bigint PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES tenants(id),contact_id uuid NOT NULL,snapshot jsonb NOT NULL,deleted boolean NOT NULL,recorded_at timestamptz NOT NULL);
CREATE TABLE crm_history_bounds(tenant_id uuid PRIMARY KEY REFERENCES tenants(id),available_from timestamptz NOT NULL);
CREATE INDEX crm_history_lookup_idx ON crm_contact_history(tenant_id,contact_id,recorded_at DESC,change_id DESC);
CREATE INDEX crm_changes_tenant_idx ON crm_contact_changes(tenant_id,id);
CREATE FUNCTION crm_profile_snapshot(r contacts) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('id',r.id,'tenant_id',r.tenant_id,'name',r.name,'email',r.email,'phone',r.phone,'lifecycle',r.lifecycle,'tags',r.tags,'attributes',r.attributes,'owner_id',r.owner_id,'archived_at',r.archived_at,'merged_into_id',r.merged_into_id,'created_at',r.created_at,'updated_at',r.updated_at)
$$;
INSERT INTO crm_history_bounds SELECT id,(SELECT started_at FROM crm_history_epoch) FROM tenants;
INSERT INTO crm_contact_history SELECT nextval('crm_contact_changes_id_seq'),tenant_id,id,crm_profile_snapshot(contacts),false,(SELECT started_at FROM crm_history_epoch) FROM contacts;
CREATE FUNCTION capture_crm_contact_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r contacts;
BEGIN
 IF TG_OP='DELETE' THEN r=OLD; ELSE r=NEW; END IF;
 INSERT INTO crm_contact_changes(tenant_id,contact_id,snapshot,deleted) VALUES(r.tenant_id,r.id,crm_profile_snapshot(r),TG_OP='DELETE');
 RETURN r;
END $$;
CREATE TRIGGER capture_crm_contact_change AFTER INSERT OR UPDATE OR DELETE ON contacts FOR EACH ROW EXECUTE FUNCTION capture_crm_contact_change();
CREATE FUNCTION crm_history_drain(batch_size integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE observed timestamptz; n integer;
BEGIN
 PERFORM pg_advisory_xact_lock(190723,67);
 observed=clock_timestamp();
 WITH chosen AS (SELECT * FROM crm_contact_changes ORDER BY id LIMIT least(greatest(batch_size,1),10000) FOR UPDATE), saved AS (
  INSERT INTO crm_contact_history(change_id,tenant_id,contact_id,snapshot,deleted,recorded_at) SELECT id,tenant_id,contact_id,snapshot,deleted,observed FROM chosen RETURNING change_id,tenant_id
 ), bounds AS (
  INSERT INTO crm_history_bounds SELECT DISTINCT s.tenant_id,greatest(t.created_at,(SELECT started_at FROM crm_history_epoch)) FROM saved s JOIN tenants t ON t.id=s.tenant_id ON CONFLICT DO NOTHING
 ) DELETE FROM crm_contact_changes WHERE id IN (SELECT change_id FROM saved);
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['crm_contact_changes','crm_contact_history','crm_history_bounds'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
 EXECUTE format('GRANT SELECT ON %I TO app_user',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION crm_history_drain(integer),capture_crm_contact_change(),crm_profile_snapshot(contacts) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm_history_drain(integer) TO app_user;
