import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {assertLocalAcceptance} from './acceptance-local.mjs';
assertLocalAcceptance();
async function api(path,token,body,method=body?'POST':'GET'){const r=await fetch('http://localhost:4000'+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();assert.ok(r.ok,path+' HTTP'+r.status+' '+JSON.stringify(d));return d;}
async function until(fn,test){for(let i=0;i<100;i++){const v=await fn();if(test(v))return v;await new Promise(r=>setTimeout(r,100));}throw new Error('Synthetic business journey timed out');}
const results=[],companies=[];
for(const business of [
 {kind:'tourism',name:'رحلة سياحية اصطناعية',price:'125000',amount:'1250.00'},
 {kind:'store',name:'منتج متجر اصطناعي',price:'99900',amount:'999.00'},
 {kind:'services',name:'استشارة خدمات اصطناعية',price:'45000',amount:'450.00'},
]){
 const started=performance.now();const owner=await api('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'Synthetic '+business.kind,workspaceName:'P2 isolated '+business.kind});const token=owner.accessToken;
 const channel=await api('/channels',token,{type:'web',name:'P2 '+business.kind});await api('/workspace/onboarding/complete',token,{});
 const product=await api('/commerce/products',token,{sku:uuid(),name:business.name,priceCents:business.price,currency:'EGP'});
 let flow=await api('/flows',token,{name:'P2 '+business.kind,channelIds:[channel.id]});
 const graph={startNodeId:'name',nodes:[
 {id:'name',type:'question',data:{text:'اسم العميل Customer name?',answerType:'text',saveAs:'customer_name',saveToSystem:'name'},edges:{ok:'product'}},
 {id:'product',type:'product',data:{productId:product.id,native:false},edges:{next:'tag'}},
 {id:'tag',type:'tag',data:{add:['P2-'+business.kind],remove:[]},edges:{next:'human'}},
 {id:'human',type:'handoff',data:{message:'تحويل للموظف Human handoff'},edges:{}},
 ]};
 flow=await api('/flows/'+flow.id,token,{graph,expectedUpdatedAt:flow.updated_at},'PATCH');await api('/flows/'+flow.id+'/publish',token,{expectedUpdatedAt:flow.updated_at});
 const visitor=await api('/widget/'+channel.external_id+'/session',null,{}),url='http://localhost:4000/widget/'+channel.external_id+'/messages?visitorId='+visitor.visitorId;
 async function visitorRequest(text){const r=await fetch(url,{method:text?'POST':'GET',headers:{'content-type':'application/json','x-visitor-token':visitor.token},...(text?{body:JSON.stringify({text,clientMsgId:uuid()})}:{})});assert.ok(r.ok);return r.json();}
 await visitorRequest('Hello مرحبا');await until(()=>visitorRequest(),v=>JSON.stringify(v).includes('Customer name?'));
 const customer='Synthetic '+business.kind+' Customer';await visitorRequest(customer);
 const cv=await until(async()=>(await api('/conversations',token)).items[0],v=>v?.handled_by==='human');
 const contact=await api('/crm/contacts/'+cv.contact_id,token);assert.equal(contact.name,customer);assert.ok(contact.tags.includes('P2-'+business.kind));
 const history=await visitorRequest();assert.ok(JSON.stringify(history).includes(business.name));assert.ok(JSON.stringify(history).includes(business.amount+' EGP'));
 await api('/conversations/'+cv.id+'/takeover',token,{});await api('/conversations/'+cv.id+'/notes',token,{text:'PRIVATE P2 '+business.kind});await api('/conversations/'+cv.id+'/messages',token,{text:'Human answer '+business.kind});
 const answer=await visitorRequest();assert.ok(JSON.stringify(answer).includes('Human answer '+business.kind));assert.ok(!JSON.stringify(answer).includes('PRIVATE P2'));
 await visitorRequest('Another customer question');assert.equal((await api('/conversations/'+cv.id,token)).handled_by,'human');
 companies.push({token,flowId:flow.id,conversationId:cv.id,productId:product.id});results.push({business:business.kind,status:'PASS',durationMs:Math.round(performance.now()-started),checks:['company onboarding','real product price','published bot','name and tag persisted to CRM','handoff','staff reply','private note','human ownership retained']});
}
for(let i=0;i<companies.length;i++)for(let j=0;j<companies.length;j++)if(i!==j){for(const path of ['/flows/'+companies[j].flowId,'/conversations/'+companies[j].conversationId]){const r=await fetch('http://localhost:4000'+path,{headers:{authorization:'Bearer '+companies[i].token}});assert.ok([403,404].includes(r.status));}}
writeFileSync('docs/p0-evidence/business-journeys-postgres.json',JSON.stringify({status:'PASS',database:process.env.BOAT_QA_EXISTING_API==='true'?'PostgreSQL CI':'PGlite local',scope:'isolated synthetic companies over actual HTTP; no real provider or full-browser business certification',results,externalCalls:false},null,2)+'\n');console.log('PASS three synthetic business journeys',JSON.stringify(results));
