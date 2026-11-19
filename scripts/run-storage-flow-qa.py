"""Focused new acceptance only; previously accepted suites are not repeated."""
import os,subprocess,time,urllib.request
from urllib.parse import urlparse
for key in ['DATABASE_URL','DATABASE_ADMIN_URL','REDIS_URL']:
    assert urlparse(os.environ[key]).hostname in ['localhost','127.0.0.1']
assert os.environ['EXTERNAL_DELIVERY_ENABLED']=='false'
with open('/tmp/boat-storage-flow-api.log','w') as log:
    p=subprocess.Popen(['node','apps/api/dist/main.js'],stdout=log,stderr=log)
    try:
        for _ in range(150):
            if p.poll() is not None:raise RuntimeError('Isolated API exited')
            try:
                urllib.request.urlopen('http://localhost:4000/health',timeout=1)
                break
            except Exception:time.sleep(.2)
        else:raise RuntimeError('Isolated API not healthy')
        for script in ['qa-storage-snapshot-postgres.mjs','qa-component-booking-runtime.mjs']:
            subprocess.run(['node','scripts/'+script],check=True)
    finally:
        p.terminate()
        p.wait(timeout=10)
