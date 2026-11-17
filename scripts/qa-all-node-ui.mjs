import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {assertLocalAcceptance} from './acceptance-local.mjs';
assertLocalAcceptance();
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {nodeSchema}=require('./dist/flows/flow-schemas.js');
const {chromium}=createRequire(import.meta.url)(process.env.BOAT_PLAYWRIGHT_MODULE||'playwright');
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

assert.deepEqual(Object.keys(fixtures).sort(),nodeSchema.options.map(o=>o.shape.type.value).sort());
async function api(path,token,body,method=body?'POST':'GET'){const r=await fetch('http://localhost:4000'+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();assert.ok(r.ok,path+' '+r.status);return d;}
const session=await api('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'31-node editor QA',workspaceName:'Isolated node configuration'}),token=session.accessToken;
await api('/channels',token,{type:'web',name:'31-node configuration'});await api('/workspace/onboarding/complete',token,{});
const browser=await chromium.launch({executablePath:process.env.BOAT_CHROMIUM||'/usr/bin/google-chrome',args:['--no-sandbox']}),results=[],out='docs/p0-evidence/node-ui-matrix';mkdirSync(out,{recursive:true});
try{for(const language of ['ar','en'])for(const width of [390,1366]){
 const t=(ar,en)=>language==='ar'?ar:en;let flow=await api('/flows',token,{name:'Node UI '+language+' '+width});
 const nodes=Object.entries(fixtures).map(([type,data],i)=>nodeSchema.parse({id:'matrix_'+type,type,data,position:{x:(i%5)*400,y:Math.floor(i/5)*350},edges:{}}));
 flow=await api('/flows/'+flow.id,token,{graph:{startNodeId:'matrix_message',nodes},expectedUpdatedAt:flow.updated_at},'PATCH');
 const context=await browser.newContext({viewport:{width,height:936}});await context.addInitScript(({session,language})=>{localStorage.setItem('session',JSON.stringify(session));localStorage.setItem('boat-language',language);},{session,language});const page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 async function openFinder(){await page.getByRole('button',{name:t('المزيد من الأدوات','More tools'),exact:true}).click();await page.getByRole('button',{name:t('البحث في العقد','Find a step'),exact:true}).click();}
 async function openNode(n){await page.getByRole('searchbox',{name:t('البحث في عقد البوت','Find a bot node'),exact:true}).fill(n.id);await page.locator('[class*="finder"] .card button').click();await page.getByRole('dialog').getByRole('button',{name:t('حفظ التغييرات','Save Changes'),exact:true}).waitFor();}
 await page.goto('http://localhost:3000/dashboard/flows/'+flow.id);await openFinder();const connected=[];
 for(const n of nodes){await openNode(n);const dialog=page.getByRole('dialog');
  if(n.type==='end')await dialog.getByRole('checkbox',{name:t('إغلاق المحادثة','Close conversation'),exact:true}).check();
  else{await dialog.getByRole('button',{name:t('الخطوات التالية','Next steps'),exact:true}).click();const select=dialog.getByRole('combobox',{name:new RegExp('^'+t('الخطوة التالية','Next step'))});if(await select.count()){await select.first().selectOption('matrix_end');connected.push(n.id);}}
  await dialog.getByRole('button',{name:t('حفظ التغييرات','Save Changes'),exact:true}).click();}
 await Promise.all([page.waitForResponse(r=>r.url().endsWith('/flows/'+flow.id)&&r.request().method()==='PATCH'&&r.ok()),page.getByRole('button',{name:t('حفظ','Save'),exact:true}).click()]);
 const stored=await api('/flows/'+flow.id,token);assert.equal(stored.draft_graph.nodes.length,31);for(const id of connected)assert.ok(Object.values(stored.draft_graph.nodes.find(n=>n.id===id).edges).includes('matrix_end'));assert.equal(stored.draft_graph.nodes.find(n=>n.type==='end').data.closeConversation,true);
 await page.reload();await openFinder();for(const n of nodes){await openNode(n);const dialog=page.getByRole('dialog');if(n.type==='end')assert.equal(await dialog.getByRole('checkbox',{name:t('إغلاق المحادثة','Close conversation'),exact:true}).isChecked(),true);else{await dialog.getByRole('button',{name:t('الخطوات التالية','Next steps'),exact:true}).click();if(connected.includes(n.id))assert.equal(await dialog.getByRole('combobox',{name:new RegExp('^'+t('الخطوة التالية','Next step'))}).first().inputValue(),'matrix_end');}await dialog.getByRole('button',{name:t('حفظ التغييرات','Save Changes'),exact:true}).click();}
 assert.deepEqual(errors,[]);await page.screenshot({path:`${out}/${language}-${width}.png`});results.push({language,width,status:'PASS',nodeConfigurations:31,editedAndReopenedConnections:connected.length,endCloseSetting:true,scope:'Every supported node inspector and routing UI/save/reopen; not every node property or external-provider execution certification'});await context.close();
}}finally{await browser.close();writeFileSync(out+'/results.json',JSON.stringify(results,null,2)+'\n');}console.log('PASS all-node editor routing/configuration journeys',results.length);
