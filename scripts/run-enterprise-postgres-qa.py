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
        for script in ['qa-sequence-error-runtime.mjs', 'qa-conversation-lock-order.mjs', 'qa-sla-role-matrix.mjs', 'qa-assignment-fairness.mjs', 'qa-advanced-node-runtime.mjs', 'qa-report-dimensions.mjs', 'qa-upload-formats.mjs', 'qa-attachment-lifecycle.mjs', 'qa-assignment-crash-recovery.mjs', 'qa-p0-node-matrix.mjs', 'qa-p0-reliability.mjs', 'qa-p0-policy-recovery.mjs', 'qa-p1-load-recovery.mjs', 'qa-p2-business-journeys.mjs', 'qa-channel-management-api.mjs', 'qa-flow-builder-api-resume.mjs', 'qa-channel-signature.mjs', 'acceptance-parity-api.mjs', 'qa-assignment-http.mjs', 'qa-auth-rate-limit.mjs', 'smoke-billing-catalog.mjs']:
            result = subprocess.run(['node', 'scripts/'+script], env=dict(os.environ, BOAT_QA_EXISTING_API='true', QA_RESUME_HTTP='true', SMOKE_API_URL='http://localhost:4000'))
            if result.returncode:
                raise SystemExit(result.returncode)
        subprocess.run(['node','scripts/qa-p0-delay-restart.mjs','--prepare'],check=True)
        # Verify database-backed history and dedupe after a real process replacement.
        server.terminate()
        server.wait(timeout=10)
        server = subprocess.Popen(['node', 'apps/api/dist/main.js'], stdout=log, stderr=log)
        for _ in range(150):
            try:
                urllib.request.urlopen('http://localhost:4000/health', timeout=1)
                break
            except Exception:
                time.sleep(.2)
        else:
            raise RuntimeError('Restarted PostgreSQL API did not recover')
        subprocess.run(['node','scripts/qa-p0-delay-restart.mjs'],check=True)
        subprocess.run(['node','scripts/qa-p1-load-recovery.mjs','--verify-restart'],check=True)
        subprocess.run(['node','scripts/qa-p1-report-response.mjs'],check=True)
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
