// Focused UX contracts; Node 22.13+; run from repository root. No network, database or sends.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes,createRequire} from 'node:module';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
{
const source=readFileSync('apps/web/lib/wizard-draft.ts','utf8').replace("import { getSession } from './api';",'const getSession = () => globalThis.testSession;');
const helpers=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
const session=(tid,sub)=>({accessToken:'header.'+Buffer.from(JSON.stringify({tid,sub})).toString('base64url')+'.sig'});
globalThis.testSession=session('company-a','user-a');const key=helpers.wizardDraftKey();assert.ok(key);
const draft={step:5,goal:'support',template:'template',name:'اسم',welcome:'أهلاً',channel:'',choices:[{title:'سؤال',reply:'رد'}],created:'server-draft'};
assert.equal(helpers.writeWizardDraft(key,draft),true);assert.deepEqual(helpers.readWizardDraft(key),draft);
globalThis.testSession=session('company-b','user-a');assert.notEqual(helpers.wizardDraftKey(),key);assert.equal(helpers.readWizardDraft(helpers.wizardDraftKey()),null);
const raw=JSON.parse(memory.get(key));raw.expiresAt=Date.now()-1;memory.set(key,JSON.stringify(raw));assert.equal(helpers.readWizardDraft(key),null);assert.equal(memory.has(key),false);
helpers.writeWizardDraft(key,draft);helpers.writeWizardDraft(key,null);assert.equal(helpers.readWizardDraft(key),null);
localStorage.setItem=()=>{throw Error('quota')};assert.equal(helpers.writeWizardDraft(key,draft),false);
console.log('PASS: wizard restore, tenant isolation, expiry, publish cleanup, storage failure');
}
{
const {buildWizardGraph}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(readFileSync('apps/web/lib/wizard-graph.ts','utf8'))).toString('base64'));
const base={startNodeId:'start',nodes:[{id:'start',type:'end',position:{x:0,y:1000},data:{},edges:{}}]};
for(const action of ['message','card','question','handoff','route']){const choice={title:'زر',reply:'نص',action,url:'https://example.test',saveAs:'answer',targetId:'start'};const graph=buildWizardGraph(base,'أهلاً',[choice]);assert.equal(base.nodes.length,1);assert.equal(graph.startNodeId,'__boat_wizard_welcome');const target=graph.nodes[0].edges['option:__boat_wizard_reply_0'];assert.ok(graph.nodes.some(n=>n.id===target));if(action==='route')assert.equal(target,'start');else{const node=graph.nodes.find(n=>n.id===target);assert.equal(node.type,{message:'message',card:'cta_url',question:'question',handoff:'handoff'}[action]);if(action==='handoff')assert.deepEqual(node.edges,{});if(action==='question')assert.deepEqual(node.edges,{ok:'start',fail:'start'});}assert.deepEqual(buildWizardGraph(graph,'أهلاً',[choice]),graph);}
assert.throws(()=>buildWizardGraph(base,'نص',[{title:'زر',reply:'',action:'route',targetId:'missing'}]));console.log('PASS: 5 independent wizard actions, valid targets, non-mutation, idempotence and invalid route rejection');
}
{
const flowTypesURL='data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(readFileSync('apps/web/lib/flow-types.ts','utf8'))).toString('base64');
let s=readFileSync('apps/web/lib/flow-layout.ts','utf8').replaceAll("'./flow-types'",JSON.stringify(flowTypesURL));
const {computeLayout,hasLayoutOverlap}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(s)).toString('base64'));
const nodes=Array.from({length:40},(_,i)=>({id:'n'+i,position:{x:0,y:0},width:290,height:i%3?270:600,data:{type:'message',data:{buttons:Array.from({length:i%4},(_,j)=>({id:'b'+j,title:'زر'}))}}}));
const edges=nodes.slice(1,35).map((n,i)=>({source:nodes[Math.floor(i/3)].id,target:n.id}));edges.push({source:'n8',target:'n0'});
for(const rtl of [true,false]){const layout=computeLayout(nodes,edges,'n0',rtl);assert.equal(Object.keys(layout).length,40);assert.equal(hasLayoutOverlap(nodes.map(n=>({...n,position:layout[n.id]})),rtl),false);assert.deepEqual(computeLayout(nodes,edges,'n0',rtl),layout);}
assert.deepEqual(computeLayout([],[],'',true),{});console.log('PASS: 40-node layout, variable heights/buttons, cycle, disconnected nodes, RTL/LTR, empty graph');
}
{
const source=readFileSync('apps/web/lib/validation-message.ts','utf8');
const {validationMessage}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const engine=readFileSync('apps/api/src/flows/engine/validate.ts','utf8');
const messages=[...engine.matchAll(/message: '([^']+)'/g)].map(x=>x[1]);for(const m of messages){assert.match(validationMessage(m,'ar'),/[\u0600-\u06ff]/);assert.equal(validationMessage(m,'en'),m);}
assert.ok(!validationMessage('Output "option:raw-id" points to a missing node','ar').includes('raw-id'));
console.log('PASS: all '+messages.length+' engine messages localized; technical output IDs hidden');
}
{
const {scaledAmount}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(readFileSync('apps/web/lib/report-format.ts','utf8'))).toString('base64'));
assert.equal(scaledAmount('123456',2,'en-US','EGP'),'1,234.56 EGP');assert.equal(scaledAmount('1',6,'en-US','USD'),'0.000001 USD');assert.equal(scaledAmount('-1',2,'en-US','USD'),'−0.01 USD');assert.equal(scaledAmount('900719925474099301',2,'en-US','USD'),'9,007,199,254,740,993.01 USD');assert.equal(scaledAmount('0',2,'en-US','USD'),'0.00 USD');assert.equal(scaledAmount('123.4',2,'en-US','USD'),'—');assert.match(scaledAmount('123456',2,'ar-EG','EGP'),/١٬٢٣٤٫٥٦/);console.log('PASS: cents/micro-USD, negative/zero values, large exact integers, invalid units, Arabic digits');
}
{
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
const url=(path,replace=s=>s)=>'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(replace(readFileSync(path,'utf8')))).toString('base64');
const apiRequire=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {tsImport}=await import(apiRequire.resolve('tsx/esm/api'));
const {validateGraph}=await tsImport('../apps/api/src/flows/engine/validate.ts',import.meta.url);
const {buildWizardGraph}=await import(url('apps/web/lib/wizard-graph.ts'));
const base={startNodeId:'end',nodes:[{id:'end',type:'end',position:{x:0,y:1000},data:{},edges:{}}]};
for(const action of ['message','card','question','handoff','route']){const g=buildWizardGraph(base,'أهلاً',[{title:'ابدأ',reply:'تفضل',action,url:'https://example.test',targetId:'end',saveAs:'answer'}]);assert.deepEqual(validateGraph(g).errors,[],action+' should satisfy the real engine validator');}
const flowTypes=url('apps/web/lib/flow-types.ts');const {fromFlow,toFlow}=await import(flowTypes);
for(const action of ['message','card','question','handoff','route']){const g=buildWizardGraph(base,'أهلاً',[{title:'ابدأ',reply:'تفضل',action,url:'https://example.test',targetId:'end'}]);const canvas=toFlow(g);const restored=fromFlow(canvas.nodes,canvas.edges,g.startNodeId);assert.deepEqual(restored,g);}
console.log('PASS: all 5 wizard actions satisfy real engine validation and round-trip through visual designer');
}
