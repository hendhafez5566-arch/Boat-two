"""Bounded live acceptance against Preview, new synthetic tenant only.
No provider calls, email, real credentials or direct SQL access. Never log session tokens.
Native Railway PostgreSQL is exercised through real HTTP transactions, not PGlite.
"""
import concurrent.futures, json, os, time, uuid, urllib.request, urllib.error, urllib.parse
from pathlib import Path
BASE='https://boat-preview-api-preview.up.railway.app'
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'docs/acceptance/2026-11-02-assignment-followup/native-http.json'
checks=[]; timings=[]
def req(path, token=None, body=None, method=None, expected=(200,201), headers=None):
    h={'Content-Type':'application/json',**(headers or {})}
    if token: h['Authorization']='Bearer '+token
    data=json.dumps(body).encode() if body is not None else None
    start=time.monotonic()
    request=urllib.request.Request(BASE+path,data=data,headers=h,method=method or ('POST' if body is not None else 'GET'))
    try:
        with urllib.request.urlopen(request,timeout=40) as r: status=r.status; raw=r.read()
    except urllib.error.HTTPError as e: status=e.code; raw=e.read()
    timings.append({'route':path.split('?')[0],'status':status,'ms':round((time.monotonic()-start)*1000)})
    value=json.loads(raw) if raw else None
    if status not in expected: raise RuntimeError(path.split('?')[0]+' unexpected HTTP '+str(status))
    return value
def check(name,actual,expected): checks.append({'name':name,'pass':actual==expected,'actual':actual,'expected':expected})
def poll(fn,predicate,seconds=35):
    until=time.monotonic()+seconds
    while True:
        value=fn()
        if predicate(value): return value
        if time.monotonic()>=until: raise RuntimeError('Asynchronous acceptance deadline exceeded')
        time.sleep(.8)
def main():
    owner=req('/auth/register',body={'email':uuid.uuid4().hex+'@example.test','password':'QA-'+uuid.uuid4().hex,'fullName':'Native PG QA owner','workspaceName':'Native PostgreSQL Assignment QA'})
    token=owner['accessToken']; staff=[]
    for name in ['Visa QA','Flights QA']:
        invite=req('/team/invitations',token,{'email':uuid.uuid4().hex+'@example.test','role':'agent','sendEmail':False})
        invtoken=urllib.parse.parse_qs(urllib.parse.urlparse(invite['inviteUrl']).query)['token'][0]
        member=req('/auth/accept-invitation',body={'token':invtoken,'password':'QA-'+uuid.uuid4().hex,'fullName':name})
        member['id']=req('/crm/workspace/members',member['accessToken'])['currentUserId']; staff.append(member)
        req('/team/me/availability',member['accessToken'],{'available':False},'PATCH')
    channel=req('/channels',token,{'type':'web','name':'Native PostgreSQL QA only'})
    policy=req('/crm/sales/settings',token)
    req('/crm/sales/settings',token,{**policy,'assignment':{'enabled':True,'method':'round_robin','maxOpenPerAgent':1,'memberIds':[m['id'] for m in staff],'rules':[]},'expected':policy})
    flow=json.loads((ROOT/'docs/acceptance/2026-11-02-assignment/assignment-flow.json').read_text())
    imported=req('/flows/import',token,flow)
    req('/flows/'+imported['id'],token,{'channelIds':[channel['id']]},'PATCH')
    req('/flows/'+imported['id']+'/publish',token,{})
    visitors=[]
    for i in range(6):
        v=req('/widget/'+channel['external_id']+'/session',body={'visitorId':'native_qa_'+uuid.uuid4().hex})
        visitors.append(v)
    def send(v,text,message_id=None):
        return req('/widget/'+channel['external_id']+'/messages?'+urllib.parse.urlencode({'visitorId':v['visitorId']}),body={'clientMsgId':message_id or uuid.uuid4().hex,'text':text},headers={'x-visitor-token':v['token']})
    def public_messages(v):
        return req('/widget/'+channel['external_id']+'/messages?'+urllib.parse.urlencode({'visitorId':v['visitorId']}),headers={'x-visitor-token':v['token']})['messages']
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool: list(pool.map(lambda v:send(v,'اختبار قبول PostgreSQL فقط'),visitors))
    conversations=poll(lambda:req('/conversations?limit=100',token),lambda x:len(x['items'])==6)['items']
    check('six concurrent visitors create six conversations',len(conversations),6)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(lambda cv:req('/conversations/'+cv['id']+'/auto-assign',token,{},expected=(400,)),conversations))
    check('away staff leave all six conversations queued',req('/crm/sales/assignment-queue',token)['total'],6)
    req('/team/me/availability',staff[0]['accessToken'],{'available':True},'PATCH')
    check('returning employee automatically resumes one queued conversation',req('/crm/sales/assignment-queue',token)['total'],5)
    # If baseline has no resume hook, concurrently force decisions to test actual database contention.
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(lambda cv:req('/conversations/'+cv['id']+'/auto-assign',token,{},expected=(200,201,400)),conversations))
    rows=req('/conversations?limit=100',token)['items']
    check('concurrent selection cannot exceed one eligible employee capacity',sum(x['assigned_to']==staff[0]['id'] for x in rows),1)
    check('away employee receives no conversation',sum(x['assigned_to']==staff[1]['id'] for x in rows),0)
    req('/team/me/availability',staff[1]['accessToken'],{'available':True},'PATCH')
    check('second returning employee automatically fills own capacity',req('/crm/sales/assignment-queue',token)['total'],4)
    # Genuine active question: the bot is waiting for a name, then a human takes over before the answer.
    v=visitors[0]
    before=poll(lambda:public_messages(v),lambda ms:any(m['senderType']=='bot' for m in ms))
    cv=next(x for x in rows if x.get('contact_external_id')==v['visitorId']) if any(x.get('contact_external_id')==v['visitorId'] for x in rows) else None
    if cv is None:
        for row in rows:
            history=req('/conversations/'+row['id']+'/messages',token)
            ms=history.get('items',history.get('messages',[])) if isinstance(history,dict) else history
            if ms and any(m['id']==before[0]['id'] for m in ms): cv=row;break
    if cv is None: raise RuntimeError('Could not match synthetic visitor to conversation')
    req('/conversations/'+cv['id']+'/takeover',token,{})
    bot_count=sum(m['senderType']=='bot' for m in before)
    send(v,'اسم بعد استلام بشري — QA')
    time.sleep(3)
    after=public_messages(v)
    check('active bot question stops during human takeover',sum(m['senderType']=='bot' for m in after),bot_count)
    detail=req('/conversations/'+cv['id'],token)
    check('human ownership persists after inbound answer',detail['handled_by'],'human')
    state={'ownerToken':token,'tenantId':owner['tenantId'],'staff':staff,'channel':channel,'conversations':[c['id'] for c in rows]}
    state_path=Path('/tmp/boat-native-qa-session.json');state_path.write_text(json.dumps(state));state_path.chmod(0o600)
    return {'tenantId':owner['tenantId'],'channelId':channel['id']}
context={}
try: context=main()
except Exception as e: checks.append({'name':'acceptance execution','pass':False,'error':str(e)})
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps({'scope':'New synthetic tenant only; real Preview API/native hosted PostgreSQL. No direct SQL or independent new database.','context':context,'concurrency':6,'checks':checks,'requests':timings},ensure_ascii=False,indent=2))
print(json.dumps({'checks':checks,'requests':len(timings)},ensure_ascii=False))
