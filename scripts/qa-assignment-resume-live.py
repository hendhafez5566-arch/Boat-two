import importlib.util,json,concurrent.futures
from pathlib import Path
# Import only the request helpers, without running the setup body.
ROOT=Path(__file__).resolve().parent.parent
src=(ROOT/'scripts/qa-assignment-live.py').read_text().split('context={}')[0]
ns={'__file__':str(ROOT/'scripts/qa-assignment-live.py')};exec(compile(src,'qa-request-helpers','exec'),ns)
req,check=ns['req'],ns['check']
s=json.loads(Path('/tmp/boat-native-qa-session.json').read_text());t=s['ownerToken']
w=req('/workspace',t)
assert w['tenant']['name']=='Native PostgreSQL Assignment QA' and w['tenant']['id']==s['tenantId'], 'Synthetic workspace identity mismatch'
for m in s['staff']:req('/team/me/availability',m['accessToken'],{'available':False},'PATCH')
for cid in s['conversations']:
 req('/conversations/'+cid,t,{'assignedTo':None,'handledBy':'bot','status':'open'},'PATCH')
 req('/conversations/'+cid+'/auto-assign',t,{},expected=(400,))
check('isolated queue restored with both staff away',req('/crm/sales/assignment-queue',t)['total'],6)
r=req('/team/me/availability',s['staff'][0]['accessToken'],{'available':True},'PATCH')
check('availability endpoint reports one resumed assignment',r.get('reassigned'),1)
check('first employee resumes queue automatically',req('/crm/sales/assignment-queue',t)['total'],5)
r=req('/team/me/availability',s['staff'][1]['accessToken'],{'available':True},'PATCH')
check('second employee resumes queue automatically',r.get('reassigned'),1)
check('two employees leave exactly four queued',req('/crm/sales/assignment-queue',t)['total'],4)
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
 repeated=list(ex.map(lambda i:req('/team/me/availability',s['staff'][i%2]['accessToken'],{'available':True},'PATCH'),range(6)))
check('concurrent availability updates do not over-assign',sum(r['reassigned'] for r in repeated),0)
rows=req('/conversations?limit=100',t)['items']
for i,m in enumerate(s['staff']):check('employee '+str(i+1)+' stays at capacity one',sum(c['assigned_to']==m['id'] for c in rows),1)
ns['OUT'].with_name('native-after.json').write_text(json.dumps({'scope':'Same isolated synthetic tenant; Preview real native PostgreSQL via HTTP, no direct SQL connection','concurrency':6,'checks':ns['checks'],'requests':ns['timings']},ensure_ascii=False,indent=2))
print(json.dumps(ns['checks'],ensure_ascii=False))
assert all(c['pass'] for c in ns['checks'])
