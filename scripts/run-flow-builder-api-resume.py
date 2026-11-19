"""Run the real isolated full-app API and internal outbox worker, then stop it."""
import os
import subprocess
import time
import urllib.request

environment = dict(os.environ, BOAT_CLOUD_REVIEW='true')
with open('/tmp/fb14-isolated-run.log', 'w') as output:
    server = subprocess.Popen(['node', 'scripts/qa-full-api.mjs'], env=environment, stdout=output, stderr=subprocess.STDOUT)
    try:
        for _ in range(150):
            if server.poll() is not None:
                raise RuntimeError('Isolated server exited; inspect /tmp/fb14-isolated-run.log')
            try:
                if urllib.request.urlopen('http://127.0.0.1:4000/health', timeout=1).status == 200:
                    break
            except Exception:
                time.sleep(.2)
        else:
            raise RuntimeError('Isolated API readiness timed out')
        result = subprocess.run(['node', 'scripts/qa-flow-builder-api-resume.mjs'])
        raise SystemExit(result.returncode)
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
