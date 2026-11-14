"""Run the production Nest app against disposable CI PostgreSQL, never Railway."""
import os
import subprocess
import time
import urllib.request
from urllib.parse import urlparse

for key in ['DATABASE_URL', 'DATABASE_ADMIN_URL', 'REDIS_URL']:
    if urlparse(os.environ[key]).hostname not in ['localhost', '127.0.0.1']:
        raise RuntimeError('Enterprise acceptance only permits loopback test services')
if os.environ.get('EXTERNAL_DELIVERY_ENABLED') != 'false':
    raise RuntimeError('External delivery must be disabled')
with open('/tmp/boat-enterprise-postgres-api.log', 'w') as log:
    server = subprocess.Popen(['node', 'apps/api/dist/main.js'], stdout=log, stderr=log)
    try:
        for _ in range(150):
            if server.poll() is not None:
                raise RuntimeError('Real PostgreSQL app exited; inspect saved logs')
            try:
                urllib.request.urlopen('http://localhost:4000/health', timeout=1)
                break
            except Exception:
                time.sleep(.2)
        else:
            raise RuntimeError('Real PostgreSQL app did not become healthy')
        for script in ['qa-channel-management-api.mjs', 'qa-flow-builder-api-resume.mjs', 'qa-channel-signature.mjs', 'acceptance-parity-api.mjs']:
            result = subprocess.run(['node', 'scripts/'+script])
            if result.returncode:
                raise SystemExit(result.returncode)
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
