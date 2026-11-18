"""Run local isolated API, Web and the repository's configured Chromium checks together."""
import tempfile
import os
import subprocess
import signal
import time
import urllib.request
procs=[]
try:
    for cmd, log in [(['node','apps/api/dist/main.js'],'/tmp/boat-journeys-api.log'), (['corepack','pnpm','--filter','web','start'],'/tmp/boat-journeys-web.log')]:
        output=open(log,'w')
        procs.append(subprocess.Popen(cmd,stdout=output,stderr=output,start_new_session=True))
    for port in [4000,3000]:
        for _ in range(150):
            if any(p.poll() is not None for p in procs):
                raise RuntimeError('An isolated QA server exited; inspect /tmp/boat-journeys logs')
            try:
                urllib.request.urlopen('http://localhost:'+str(port)+('/health' if port==4000 else '/login'),timeout=1)
                break
            except Exception:
                time.sleep(.2)
        else:
            raise RuntimeError('Server not ready '+str(port))
    environment=dict(os.environ,BOAT_PREVIEW_ONLY='true',EXTERNAL_DELIVERY_ENABLED='false')
    with tempfile.TemporaryDirectory(prefix='boat-role-') as private:
        environment['BOAT_ROLE_BROWSER_FIXTURE']=private+'/fixture.json'
        subprocess.run(['node','scripts/qa-role-boundaries.mjs'],env=environment,check=True)
        subprocess.run(['node','scripts/qa-role-boundaries-browser.mjs'],env=environment,check=True)
finally:
    for p in procs:
        try:
            os.killpg(p.pid,signal.SIGTERM)
        except ProcessLookupError:
            pass
    for p in procs:
        try:
            p.wait(timeout=10)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(p.pid,signal.SIGKILL)
            except ProcessLookupError:
                pass
