// Offline: calendar bounds, actual draft-save handler, and widget script syntax. No services or sends.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {Script} from 'node:vm';
const source=path=>readFileSync(path,'utf8');
const load=async path=>import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source(path))).toString('base64'));
const {reportRange,localDay,dayStart}=await load('apps/web/lib/time-range.ts');
assert.deepEqual(reportRange('2026-10-24','2026-10-24','Africa/Cairo'),{from:'2026-10-23T21:00:00.000Z',to:'2026-10-24T21:00:00.000Z'});
for(const [date,zone,hours] of [['2026-03-08','America/New_York',23],['2026-11-01','America/New_York',25],['2026-04-24','Africa/Cairo',23],['2026-10-29','Africa/Cairo',25],['2026-10-24','Asia/Kathmandu',24]]){
 const range=reportRange(date,date,zone);assert.equal((Date.parse(range.to)-Date.parse(range.from))/3600000,hours);
 assert.equal(localDay(new Date(range.from),zone),date);assert.equal(localDay(new Date(Date.parse(range.to)-1),zone),date);
}
assert.throws(()=>reportRange('2026-02-30','2026-03-01','UTC'));
assert.throws(()=>reportRange('2026-10-25','2026-10-24','UTC'));
assert.throws(()=>dayStart('2011-12-30','Pacific/Apia'));
assert.throws(()=>reportRange('2026-10-24','2026-10-24','Invalid/Zone'));
console.log('PASS: workspace days, inclusive final day, Cairo/New York DST, fractional offsets, invalid/skipped dates');
const composer=source('apps/web/components/business/CampaignComposer.tsx');
const start=composer.indexOf('  async function save() {'),end=composer.indexOf('  const labels = [',start);
assert.ok(start>=0 && end>start);
const handler=stripTypeScriptTypes(composer.slice(start,end));
for(const eligible of [0,1]){
 const calls=[],errors=[];let saved=false;
 const noop=()=>{};
 const context={api:async(path,request)=>{calls.push({path,request});return path==='/campaigns/audience'?{matched:1,eligible,excluded:1-eligible,reasons:[],channelPolicyEnabled:false}:{id:'draft'};},setBusy:noop,setError:e=>{if(e)errors.push(e);},setAudience:noop,setStep:noop,setName:noop,setText:noop,setRich:noop,onSaved:async()=>{saved=true;},channel:'channel',filters:{},name:'Draft',frequency:24,selectedTemplate:null,templateValue:null,rich:{},text:'Message',t:a=>a};
 await new Function('ctx',`return (async()=>{const {${Object.keys(context).join(',')}}=ctx;${handler};await save();})()`)(context);
 assert.deepEqual(errors,[]);assert.equal(saved,true);assert.deepEqual(calls.map(c=>c.path),['/campaigns/audience','/campaigns']);
 assert.equal(calls[1].request.method,'POST');assert.equal(JSON.parse(calls[1].request.body).name,'Draft');
}
console.log('PASS: actual campaign save accepts empty/eligible audience as draft; never schedules or sends');
for(const match of source('apps/web/public/widget-demo.html').matchAll(/<script>([\s\S]*?)<\/script>/g))new Script(match[1]);
console.log('PASS: widget demo script syntax');
const controller=source('apps/api/src/business/reports.controller.ts');
const callback=stripTypeScriptTypes(controller.slice(controller.indexOf('async (c) => {'),controller.lastIndexOf('    });'))+'}');
for(const [configured,expected] of [['Asia/Dubai','Asia/Dubai'],['Invalid/Zone','Africa/Cairo'],[null,'Africa/Cairo']]){
 const calls=[];
 const input=reportRange('2026-10-24','2026-10-24',expected),r={user:{tenantId:'company-a'}};
 const read=new Function('input','r',`return (${callback});`)(input,r);
 const result=await read({query:async(sql,params)=>{calls.push({sql,params});return {rows:sql.startsWith('SELECT settings')?[{timezone:configured}]:[]};}});
 assert.equal(result.timezone,expected);assert.deepEqual(result.range,input);assert.deepEqual(calls[0].params,['company-a']);
 const daily=calls.find(q=>q.sql.includes('AS day'));assert.ok(daily.sql.includes('AT TIME ZONE $3'));assert.deepEqual(daily.params,[input.from,input.to,expected]);
 assert.ok(calls.slice(2).every(q=>q.params.length===2));
}
console.log('PASS: actual report query callback uses tenant settings and bound timezone parameter; UTC filtering remains exclusive');
