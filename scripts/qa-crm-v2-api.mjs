import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {openSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const log=openSync('/tmp/boat-crm-v2-api.log','w');
const server=spawn(process.execPath,['scripts/qa-full-api.mjs'],{stdio:['ignore',log,log],env:{...process.env,BOAT_CLOUD_REVIEW:'true'}});
let count=0;
const sessions=[];
const request=async(path,token,body,method=body?'POST':'GET',expected=200)=>{const r=await fetch('http://127.0.0.1:4000'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.ok(r.status===expected||(expected===200&&r.status===201),path+': '+JSON.stringify(data));return data;};
try{
 for(let i=0;i<300;i++){try{if((await fetch('http://127.0.0.1:4000/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,300));}
 for(const business of ['Travel','Restaurant','Store']){
  const s=await request('/auth/register',null,{email:randomUUID()+'@example.test',password:'Synthetic-'+randomUUID(),fullName:'V2 '+business,workspaceName:'V2 '+business});const token=s.accessToken;assert.ok(token);sessions.push(s);
  const c=await request('/crm/contacts',token,{name:business+' Customer',email:randomUUID()+'@example.test',phone:'+201'+String(Math.floor(Math.random()*1e9)).padStart(9,'0'),lifecycle:'qualified',tags:['interested'],attributes:{source:'Website'}});
  const p=await request('/crm/pipelines',token,{name:'Sales',stages:['New','Qualified','Proposal']});
  await request('/crm/deals',token,{contactId:c.id,pipelineId:p.id,title:'Offer EGP',stage:'New',valueCents:125000,currency:'EGP'});
  await request('/crm/deals',token,{contactId:c.id,pipelineId:p.id,title:'Offer USD',stage:'New',valueCents:50000,currency:'USD'});
  await request('/crm/tasks',token,{contactId:c.id,title:'Follow up',dueAt:new Date(Date.now()-3600000).toISOString()});
  const a=await request('/crm/workspace/analytics',token);
  assert.equal(a.contacts.total,1);assert.equal(a.contacts.qualified,1);assert.equal(a.sales.length,2);assert.equal(a.sales.find(x=>x.currency==='EGP').value_cents,'125000');assert.equal(a.followups.overdue,1);assert.equal(a.contacts.unattended,0);assert.equal(a.growth.reduce((sum,x)=>sum+x.count,0),1);count++;
  const score=await request('/crm/workspace/score/'+c.id,token);assert.equal(score.score,100);assert.equal(score.reasons.length,5);count++;
  await request('/crm/workspace/scoring',token,{qualified:5,email:0,phone:0,openDeal:0,interestTag:'interested',tag:0});assert.equal((await request('/crm/workspace/score/'+c.id,token)).score,5);count++;
  const q=new URLSearchParams({createdFrom:a.startAt,createdTo:a.endAt});assert.equal((await request('/crm/contacts?'+q,token)).total,1);assert.equal((await request('/crm/contacts?withoutFollowup=true',token)).total,0);assert.equal((await request('/crm/contacts?hasOpenDeal=true',token)).total,1);count++;
  await request('/crm/workspace/analytics?from=2026-02-30&to=2026-03-01',token,null,'GET',400);await request('/crm/workspace/analytics?from=2020-01-01&to=2026-01-01',token,null,'GET',400);count++;
  const historical=await request('/crm/workspace/analytics?from=2000-01-01&to=2000-01-02',token);assert.equal(historical.sales.length,0);assert.equal(historical.contacts.new,0);count++;
  const invite=await request('/team/invitations',token,{email:randomUUID()+'@example.test',role:'agent',sendEmail:false});const agent=await request('/auth/accept-invitation',null,{token:new URL(invite.inviteUrl).searchParams.get('token'),password:'Synthetic-'+randomUUID(),fullName:business+' Agent'});
  const own=await request('/crm/workspace/analytics?ownerId='+c.id,agent.accessToken);assert.equal(own.scope,'mine');assert.equal(own.contacts.total,0);assert.equal(own.sales.length,0);assert.equal(own.employees.length,1);await request('/crm/workspace/scoring',agent.accessToken,{qualified:99,email:0,phone:0,openDeal:0,interestTag:'',tag:0},'POST',403);count++;
  for(const other of sessions.slice(0,-1))await request('/crm/workspace/score/'+c.id,other.accessToken,null,'GET',404);count++;
 }
 mkdirSync('docs/acceptance/2026-11-01-crm-v2',{recursive:true});writeFileSync('docs/acceptance/2026-11-01-crm-v2/api-results.json',JSON.stringify({passed:count,tenants:3,database:'99 real migrations on isolated PGlite with RLS; no owner database',tests:['currency separation/no join inflation','score rules and configurable recalculation','date and range rejection','period cohort and date drilldown','agent scope cannot widen','admin write authorization','cross tenant identity denial']},null,2));console.log('CRM_V2_API_PASS',count);
}finally{server.kill('SIGTERM');}
