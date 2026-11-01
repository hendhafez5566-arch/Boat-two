import urllib.request,json,uuid,datetime,os
from pathlib import Path
if os.environ.get('BOAT_CRM_LIVE_QA') != '1':
 raise SystemExit('Set BOAT_CRM_LIVE_QA=1 to create a synthetic QA tenant on the named Preview only.')
base='https://boat-preview-api-preview.up.railway.app'
checks=[]
def call(path,body=None,token=None,method=None,headers=None):
 h={'Content-Type':'application/json',**(headers or {})}
 if token:h['Authorization']='Bearer '+token
 b=body if isinstance(body,bytes) else json.dumps(body).encode() if body is not None else None
 r=urllib.request.urlopen(urllib.request.Request(base+path,data=b,headers=h,method=method or ('POST' if body is not None else 'GET')),timeout=40)
 return json.load(r)
health=call('/health');assert health['db']=='up';checks.append('health/db up')
uid=str(uuid.uuid4());session=call('/auth/register',{'fullName':'CRM Release QA','workspaceName':'CRM Release QA '+uid[:8],'email':'crm-release-'+uid+'@example.test','password':'Synthetic-'+str(uuid.uuid4())})
token=session['accessToken']
assert call('/channels',token=token)==[];assert call('/flows',token=token)==[];checks.append('new independent tenant: no channels/no auto-created bot')
member=call('/crm/workspace/members',token=token);owner=member['currentUserId']
c=call('/crm/contacts',{'name':'CRM Preview synthetic customer','email':uid+'@example.test','attributes':{'company':'CRM QA synthetic company','source':'Release QA'}},token)
p=call('/crm/pipelines',{'name':'QA Preview pipeline','stages':['New','Qualified']},token)
d=call('/crm/deals',{'contactId':c['id'],'pipelineId':p['id'],'title':'CRM release QA','stage':'New','valueCents':12345,'currency':'EGP','ownerId':owner,'expectedClose':'2026-12-15'},token)
assert d['owner_id']==owner and d['expected_close'].startswith('2026-12-15')
d=call('/crm/deals/'+d['id'],{'stage':'Qualified','expectedUpdatedAt':d['updated_at']},token,'PATCH');assert d['stage']=='Qualified';checks.append('customer/deal/owner/expected close/stage persisted')
t=call('/crm/tasks',{'contactId':c['id'],'title':'Synthetic follow-up','dueAt':'2026-12-15T12:00:00Z','assignedTo':owner},token)
t=call('/crm/tasks/'+t['id'],{'status':'done','expectedUpdatedAt':t['updated_at']},token,'PATCH');assert t['status']=='done';checks.append('follow-up assigned/completed')
s=call('/crm/workspace/search',{'conditions':{'anyOf':[{'q':'synthetic'},{'tag':'unknown'}]}},token);assert s['total']==1
v=call('/crm/workspace/views',{'name':'Release QA view','conditions':{'q':'synthetic'}},token);assert call('/crm/workspace/views',token=token)[0]['id']==v['id'];assert call('/crm/segments',token=token)==[];checks.append('smart views persisted; legacy segments isolated')
boundary='qa-'+uid
csv='Name,Email\nPreview CSV,'+uid+'-csv@example.test\n'
body=('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="qa.csv"\r\nContent-Type: text/csv\r\n\r\n'+csv+'\r\n--'+boundary+'--\r\n').encode()
preview=call('/crm/workspace/import-preview',body,token,headers={'Content-Type':'multipart/form-data; boundary='+boundary});assert len(preview['rows'])==2;checks.append('live CSV upload preview')
r=call('/crm/workspace/report',token=token);assert r['contacts']['total']==1;assert len(r['sales'])==1;checks.append('report reads actual CRM data')
call('/crm/contacts/'+c['id']+'/archive',{'archived':True},token,'PATCH');assert call('/crm/contacts',token=token)['total']==0
call('/crm/contacts/'+c['id']+'/archive',{'archived':False},token,'PATCH');assert call('/crm/contacts',token=token)['total']==1;checks.append('archive/restore preserved')
result={'status':'PASS','testedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'environment':'existing Railway Preview; new synthetic QA tenant only','checks':checks,'limits':['No owner tenant or channel changed','No WhatsApp messages, new Meta webhook, Google OAuth or live Sheets sync tested','No authenticated Cloud Browser owner session']}
Path('docs/acceptance/2026-11-01-crm/live-api-results.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result))
