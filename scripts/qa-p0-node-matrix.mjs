import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {assertLocalAcceptance} from './acceptance-local.mjs';
assertLocalAcceptance();
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {nodeSchema}=require('./dist/flows/flow-schemas.js');
const fixtures={
 product:{productId:uuid()},catalog:{productIds:[],text:'Catalog'},appointment:{serviceId:uuid(),start:'2030-01-01T10:00:00Z'},
 whatsapp_flow:{text:'Form',flowId:'123',cta:'Open',screen:'START'},subflow:{flowId:uuid()},
 message:{text:'نص عربي English'},interactive:{text:'Choose',buttons:[{id:'a',title:'اختيار'}]},location:{lat:'30',lng:'31'},
 cta_url:{text:'Open',buttonText:'Open',url:'https://example.invalid'},template:{name:'synthetic_template'},sequence:{sequenceId:''},
 image:{url:'https://example.invalid/p.png'},audio:{url:'https://example.invalid/a.mp3'},video:{url:'https://example.invalid/v.mp4'},file:{url:'https://example.invalid/f.pdf'},
 user_input:{questions:[{id:'name',text:'الاسم Name',kind:'text',saveAs:'name'}]},question:{text:'Email',saveAs:'email',answerType:'email'},
 condition:{rules:[{id:'ok',conditions:[{source:'variable',key:'code',operator:'equals',value:'42'}]}]},set_variable:{assignments:[{name:'code',operation:'set',value:'42'}]},
 set_attribute:{key:'code',value:'{{code}}'},delay:{amount:1,unit:'seconds'},http_request:{method:'GET',url:'https://example.invalid'},
 sheet_fetch:{url:'',connectionId:uuid(),spreadsheetId:'synthetic',range:'A1:B2'},business_hours:{timezone:'Africa/Cairo',schedule:{}},
 split:{branches:[{id:'a',weight:100},{id:'b',weight:0}]},random_number:{min:7,max:7,saveAs:'fixed'},ai_reply:{greeting:'Test only',answerFirst:false},handoff:{message:'To staff'},tag:{add:['P0-MATRIX'],remove:[]},note:{body:'Private node note'},end:{},
};
assert.deepEqual(Object.keys(fixtures).sort(),nodeSchema.options.map(o=>o.shape.type.value).sort(),'Every currently supported node needs a fixture');
async function api(path,token,body,method=body?'POST':'GET'){const r=await fetch('http://localhost:4000'+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();assert.ok(r.ok,path+' '+r.status+' '+JSON.stringify(d));return d;}
const owner=await api('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'Node matrix',workspaceName:'Isolated node matrix'}),token=owner.accessToken;
const channel=await api('/channels',token,{type:'web',name:'Node matrix'});let flow=await api('/flows',token,{name:'Node contracts',channelIds:[channel.id]});
const nodes=Object.entries(fixtures).map(([type,data],i)=>nodeSchema.parse({id:type,type,data,position:{x:i*50,y:100},edges:{}}));
const graph={startNodeId:'message',nodes};
flow=await api('/flows/'+flow.id,token,{graph,expectedUpdatedAt:flow.updated_at},'PATCH');
assert.deepEqual((await api('/flows/'+flow.id,token)).draft_graph,graph,'All supported node properties survive API/DB roundtrip');
// Actual published runtime, without simulator hooks or provider transport.
const n=(id,type,data,edges={})=>({id,type,data,edges});
const runtime={startNodeId:'vars',nodes:[
 n('vars','set_variable',fixtures.set_variable,{next:'condition'}),n('condition','condition',fixtures.condition,{'rule:ok':'random',else:'bad'}),
 n('random','random_number',fixtures.random_number,{next:'attribute'}),n('attribute','set_attribute',{key:'code',value:'{{code}}-{{fixed}}'},{next:'tag'}),
 n('tag','tag',fixtures.tag,{next:'note'}),n('note','note',fixtures.note,{next:'split'}),n('split','split',fixtures.split,{'branch:a':'hours','branch:b':'bad'}),
 n('hours','business_hours',fixtures.business_hours,{closed:'answer',open:'bad'}),n('answer','message',{text:'مقبول Accepted {{code}}/{{fixed}}'},{next:'end'}),n('bad','message',{text:'MUST-NOT-EXECUTE'},{next:'end'}),n('end','end',{}),
]};
flow=await api('/flows/'+flow.id,token,{graph:runtime,expectedUpdatedAt:flow.updated_at},'PATCH');await api('/flows/'+flow.id+'/publish',token,{expectedUpdatedAt:flow.updated_at});
const visitor=await api('/widget/'+channel.external_id+'/session',null,{}),url='http://localhost:4000/widget/'+channel.external_id+'/messages?visitorId='+visitor.visitorId;
assert.ok((await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-visitor-token':visitor.token},body:JSON.stringify({text:'Start',clientMsgId:uuid()})})).ok);
let messages;for(let attempt=0;attempt<100;attempt++){messages=await (await fetch(url,{headers:{'x-visitor-token':visitor.token}})).json();if(JSON.stringify(messages).includes('مقبول Accepted 42/7'))break;await new Promise(r=>setTimeout(r,100));}
if(!JSON.stringify(messages).includes('مقبول Accepted 42/7')){const debug=(await api('/conversations',token)).items[0];console.log(JSON.stringify(await api('/conversations/'+debug.id+'/messages',token)));}
assert.ok(JSON.stringify(messages).includes('مقبول Accepted 42/7'),JSON.stringify(messages));assert.ok(!JSON.stringify(messages).includes('MUST-NOT-EXECUTE'));assert.ok(!JSON.stringify(messages).includes('Private node note'));
const cv=(await api('/conversations',token)).items[0],contact=await api('/crm/contacts/'+cv.contact_id,token);
assert.equal(contact.attributes.code,'42-7');assert.ok(contact.tags.includes('P0-MATRIX'));
writeFileSync('docs/p0-evidence/node-matrix-http.json',JSON.stringify({status:'PASS',draftRoundtripNodes:Object.keys(fixtures),publishedRuntimeNodes:[...new Set(runtime.nodes.map(n=>n.type))],checks:['conditional branch','variable interpolation','deterministic random bound','contact attribute and tag persisted','private note hidden','business-hours closed route','weighted split','actual published Webchat response'],limitations:'Draft contract coverage is not per-node UI or live provider acceptance. Media/provider/API/sheet/booking execution and immutable in-flight-version matrix remain scoped separately.'},null,2)+'\n');
console.log('PASS all',nodes.length,'node draft contracts and published runtime/CRM branch chain');
