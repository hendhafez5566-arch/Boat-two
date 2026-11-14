"""Run local isolated API, Web and the repository's configured Chromium checks together."""
import os
import subprocess
import time
import urllib.request
procs=[]
try:
    for cmd, log in [(['node','scripts/qa-full-api.mjs'],'/tmp/boat-journeys-api.log'), (['corepack','pnpm','--filter','web','start'],'/tmp/boat-journeys-web.log')]:
        output=open(log,'w')
        procs.append(subprocess.Popen(cmd,stdout=output,stderr=output))
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
    raise SystemExit(subprocess.run(['node',os.environ.get('BOAT_QA_BROWSER_SCRIPT','scripts/qa-connect-journeys-browser.mjs')],env=environment).returncode)
finally:
    for p in procs:
        p.terminate()
    for p in procs:
        try:
            p.wait(timeout=10)
        except subprocess.TimeoutExpired:
            p.kill()
