import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {assertLocalAcceptance} from './acceptance-local.mjs';
assertLocalAcceptance();
const base='http://localhost:4000';
async function call(path,token,body,method=body?'POST':'GET'){
 const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const text=await response.text();return {status:response.status,data:text?JSON.parse(text):null};
}
async function api(...args){const r=await call(...args);assert.ok(r.status<300,args[0]+' '+r.status+' '+JSON.stringify(r.data));return r.data;}
async function company(){return api('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'Lifecycle QA',workspaceName:'Isolated flow lifecycle'});}
const owner=await company(),foreign=await company(),token=owner.accessToken;
async function invite(role){const invitation=await api('/team/invitations',token,{email:uuid()+'@example.test',role,sendEmail:false});return api('/auth/accept-invitation',null,{token:new URL(invitation.inviteUrl).searchParams.get('token'),password:'Synthetic-'+uuid(),fullName:'Lifecycle '+role});}
const admin=await invite('admin'),agent=await invite('agent'),channel=await api('/channels',token,{type:'web',name:'Lifecycle only'});
const node=(id,type,data,edges={})=>({id,type,data,edges,position:{x:0,y:0}});
async function save(id,graph,extra={}){const current=await api('/flows/'+id,token);return api('/flows/'+id,token,{graph,...extra,expectedUpdatedAt:current.updated_at},'PATCH');}
async function publish(id,as=token){const current=await api('/flows/'+id,as);return api('/flows/'+id+'/publish',as,{expectedUpdatedAt:current.updated_at});}
async function active(){return (await api('/channels',token)).find(c=>c.id===channel.id).settings.activeBotFlowId;}
const component=await api('/flows',token,{name:'Lifecycle component',isComponent:true});
await save(component.id,{startNodeId:'e'.repeat(60),nodes:[node('e'.repeat(60),'end',{})]},{folderName:'Synthetic components'});await publish(component.id);
const bot=await api('/flows',token,{name:'Lifecycle bot',channelIds:[channel.id]});
await save(bot.id,{startNodeId:'c'.repeat(60),nodes:[node('c'.repeat(60),'subflow',{flowId:component.id},{next:'message'}),node('message','message',{text:'Published lifecycle baseline'})]});await publish(bot.id);assert.equal(await active(),bot.id);
assert.equal((await call('/flows/'+component.id+'/duplicate',agent.accessToken,{})).status,403);
assert.equal((await call('/flows/'+component.id+'/duplicate',foreign.accessToken,{})).status,404);
const copied=await api('/flows/'+component.id+'/duplicate',admin.accessToken,{});
assert.equal(copied.is_component,true);assert.equal(copied.folder_name,'Synthetic components');assert.equal(copied.status,'draft');assert.equal(copied.published_version_id,null);
assert.deepEqual((await api('/flows/'+copied.id,token)).draft_graph,(await api('/flows/'+component.id,token)).draft_graph);
await publish(copied.id,admin.accessToken);assert.equal(await active(),bot.id,'component copy publication cannot replace a live channel bot');
const versions=await api('/flows/'+bot.id+'/versions',token);
const tooLarge={startNodeId:'component',nodes:[node('component','subflow',{flowId:component.id},{next:'m0'}),...Array.from({length:299},(_,i)=>node('m'+i,'message',{text:'Message '+i},i<298?{next:'m'+(i+1)}:{}))]};
const dirty=await save(bot.id,tooLarge);const rejected=await call('/flows/'+bot.id+'/publish',token,{expectedUpdatedAt:dirty.updated_at});assert.equal(rejected.status,400);assert.match(JSON.stringify(rejected.data),/exceeds 300 nodes/);
assert.deepEqual(await api('/flows/'+bot.id+'/versions',token),versions);assert.equal(await active(),bot.id);
assert.equal((await call('/flows/'+bot.id+'/versions/'+versions[0].id+'/restore',agent.accessToken,{expectedUpdatedAt:dirty.updated_at})).status,403);
await api('/flows/'+bot.id+'/versions/'+versions[0].id+'/restore',admin.accessToken,{expectedUpdatedAt:dirty.updated_at});
const restoredGraph=(await api('/flows/'+bot.id,token)).draft_graph;assert.equal(restoredGraph.nodes.find(n=>n.id==='message').data.text,'Published lifecycle baseline');assert.ok(restoredGraph.nodes.every(n=>n.id.length<=60));await save(bot.id,restoredGraph);assert.equal(await active(),bot.id,'restoring and saving draft does not change publication');
const botCopy=await api('/flows/'+bot.id+'/duplicate',token,{});assert.equal(botCopy.is_component,false);await publish(botCopy.id);assert.equal(await active(),botCopy.id);
assert.equal((await call('/flows/'+botCopy.id,agent.accessToken,undefined,'DELETE')).status,403);
assert.equal((await call('/flows/'+botCopy.id,foreign.accessToken,undefined,'DELETE')).status,404);assert.equal(await active(),botCopy.id);
await api('/flows/'+bot.id,token,undefined,'DELETE');assert.equal(await active(),botCopy.id,'deleting inactive bot must preserve another active selection');
await api('/flows/'+botCopy.id,admin.accessToken,undefined,'DELETE');assert.equal(await active(),undefined,'deleting active bot clears its channel pointer');
await api('/flows/'+copied.id,admin.accessToken,undefined,'DELETE');assert.equal(await active(),undefined);
writeFileSync('docs/p0-evidence/flow-lifecycle.json',JSON.stringify({status:'PASS',checks:['owner/admin duplicate retains component kind/folder/draft without publication','component clone publish cannot replace active channel bot','normal clone remains a normal bot','valid 300-node draft expanding beyond cap rejected atomically','failed publication preserves version and active channel','admin restore of expanded long-ID component remains editable and saves without changing publication','agent/foreign duplicate/restore/delete denied','inactive deletion preserves replacement selection','active deletion clears channel selection'],scope:'isolated API with real PostgreSQL; synthetic records only, no customer files or provider sends'},null,2)+'\n');
console.log('PASS real PostgreSQL component/bot duplicate, bounded publish, restore, delete and roles');
