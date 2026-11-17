"""Restore acceptance for disposable local CI PostgreSQL only. Never use on Railway."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import urlparse, urlunparse

admin = os.environ.get('DATABASE_ADMIN_URL', '')
u = urlparse(admin)
if u.hostname not in ('localhost', '127.0.0.1') or u.path != '/boat_qa':
    raise SystemExit('Restore acceptance requires the disposable loopback boat_qa database')
if os.environ.get('GITHUB_ACTIONS') != 'true':
    raise SystemExit('Restore acceptance is CI-only')
restored = urlunparse(u._replace(path='/boat_restore_qa'))

def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout.strip()

def sql(url, query):
    return run('psql', url, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', query)

# Do not overwrite a pre-existing database, even in CI.
assert sql(admin, "SELECT count(*) FROM pg_database WHERE datname='boat_restore_qa'") == '0'
owner = sql(admin, 'SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()')
assert owner in ('postgres', 'app_user')
with tempfile.TemporaryDirectory(prefix='boat-restore-') as directory:
    dump = str(Path(directory) / 'acceptance.dump')
    run('pg_dump', '--dbname', admin, '--format=custom', '--file', dump)
    sql(admin, 'CREATE DATABASE boat_restore_qa')
    run('pg_restore', '--dbname', restored, '--exit-on-error', dump)
    tables = sql(admin, "SELECT string_agg(format('SELECT %L AS name, count(*)::bigint AS rows FROM %I.%I', tablename, schemaname, tablename), ' UNION ALL ' ORDER BY tablename) FROM pg_tables WHERE schemaname='public'")
    assert tables
    counts_query = f'SELECT name, rows FROM ({tables}) counts ORDER BY name'
    assert sql(admin, counts_query) == sql(restored, counts_query), 'Restored row counts differ'
    policies = "SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname"
    assert sql(admin, policies) == sql(restored, policies), 'Restored RLS policies differ'
    security = "SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname"
    assert sql(admin, security) == sql(restored, security), 'Restored table security/ownership differs'
    result = {'status': 'PASS', 'scope': 'disposable CI PostgreSQL only', 'checks': ['custom dump restores without errors', 'all public table row counts', 'RLS policy definitions', 'RLS flags and table ownership'], 'productionBackupTested': False}
    output = Path('docs/p0-evidence/backup-restore.json')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
