// Real local PostgreSQL, fake Google transport in this process only. No external requests.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {DatabaseService}=require('./dist/database/database.service.js'),{CryptoService}=require('./dist/messaging/crypto.service.js'),{GoogleService}=require('./dist/integrations/google.service.js'),{PlansService}=require('./dist/plans/plans.service.js'),{env}=require('./dist/config/env.js');
if(process.env.BOAT_PREVIEW_ONLY!=='true'||!['localhost','127.0.0.1'].includes(new URL(env.DATABASE_URL).hostname))throw Error('Local isolated DB required');
const original=globalThis.fetch,db=new DatabaseService(),crypto=new CryptoService(),google=new GoogleService(db,crypto,new PlansService(db));
try{
 const r=await original((process.env.SMOKE_API_URL||'http://localhost:4000')+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`contacts-${randomUUID()}@example.test`,password:'local-google-test-12345',fullName:'Google Mock owner',workspaceName:'Google Mock CRM'})});assert.equal(r.status,201);const a=await r.json(),user=JSON.parse(Buffer.from(a.accessToken.split('.')[1],'base64url')).sub;
 let calls=0,personId='123';
 // Only this test process is enabled, behind a fail-closed fake transport.
 globalThis.fetch=async(url,options)=>{calls++;if(String(url)==='https://oauth2.googleapis.com/token')return new Response(JSON.stringify({access_token:'mock-access',refresh_token:'mock-refresh',expires_in:3600,scope:'https://www.googleapis.com/auth/contacts.readonly'}));assert.match(String(url),/^https:\/\/people.googleapis.com\/v1\/people\/me\/connections\?/);assert.equal(options.headers.Authorization,'Bearer mock-access');return new Response(JSON.stringify({connections:[{resourceName:'people/'+personId,names:[{displayName:'مريم التجريبية'}],emailAddresses:[{value:`mariam-${personId}@example.test`}]}],nextPageToken:'mock-next'}));};
 env.EXTERNAL_DELIVERY_ENABLED='true';env.GOOGLE_CLIENT_ID='mock-client';env.GOOGLE_CLIENT_SECRET='mock-secret';
 const start=await google.start(a.tenantId,user,['contacts_read']);const state=new URL(start.authorizeUrl).searchParams.get('state');assert.equal(new URL(start.authorizeUrl).searchParams.get('scope'),'https://www.googleapis.com/auth/contacts.readonly');await google.complete(state,'mock-code');await assert.rejects(google.complete(state,'mock-code'),/expired|consumed/);
 const connection=await db.withTenant(a.tenantId,async c=>(await c.query("SELECT id FROM integration_connections WHERE provider='google'")).rows[0]);
 const preview=await google.execute(a.tenantId,connection.id,{operation:'contacts_import'},true);assert.equal(preview.mock,true);assert.equal(calls,1);
 const imported=await google.execute(a.tenantId,connection.id,{operation:'contacts_import'});assert.equal(imported.data.imported,1);assert.equal(imported.data.marketingConsentGranted,false);
 const replay=await google.execute(a.tenantId,connection.id,{operation:'contacts_import'});assert.equal(replay.data.imported,0);assert.equal(replay.data.linked,1);
 const count=await db.withTenant(a.tenantId,async c=>(await c.query('SELECT count(*)::int AS n FROM contacts')).rows[0].n);assert.equal(count,1);assert.equal((await db.withTenant(a.tenantId,c=>c.query('SELECT * FROM contact_consents'))).rowCount,0);
 await assert.rejects(google.execute(randomUUID(),connection.id,{operation:'contacts_import'}),/unavailable/);
 await db.withTenant(a.tenantId,c=>c.query("UPDATE integration_connections SET config='{\"scopes\":[]}' WHERE id=$1",[connection.id]));const before=calls;await assert.rejects(google.execute(a.tenantId,connection.id,{operation:'contacts_read'}),/required purpose/);assert.equal(calls,before);
 await db.withTenant(a.tenantId,async c=>{await c.query("UPDATE integration_connections SET config='{\"scopes\":[\"https://www.googleapis.com/auth/contacts.readonly\"]}' WHERE id=$1",[connection.id]);await c.query("UPDATE subscriptions SET plan_id=(SELECT id FROM plans WHERE code='free'),status='active'");await c.query("INSERT INTO contacts(tenant_id,name) SELECT $1,'Limit fixture '||n FROM generate_series(1,99) n",[a.tenantId]);});
 personId='limit';await assert.rejects(google.execute(a.tenantId,connection.id,{operation:'contacts_import'}),error=>error.response?.code==='PLAN_LIMIT');assert.equal((await db.withTenant(a.tenantId,async c=>(await c.query('SELECT count(*)::int AS n FROM contacts')).rows[0].n)),100);
 console.log('PASS Google Contacts: OAuth state single use, read-only scope, preview without calls, real CRM import/replay without marketing consent, cross-tenant denial missing-scope rejection and plan-limit rollback; all Google HTTP mocked.');
}finally{globalThis.fetch=original;await db.onModuleDestroy();}
