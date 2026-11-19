#!/bin/sh
set -eu
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=app_password="$APP_DATABASE_PASSWORD" --set=ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE app_user LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD :'app_password';
SQL
