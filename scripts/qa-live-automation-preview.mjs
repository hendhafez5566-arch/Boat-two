/* global localStorage, document, innerWidth */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright');
const web = 'https://boat-preview-web-preview.up.railway.app';
const api = 'https://boat-preview-api-preview.up.railway.app';
const shots = 'docs/enterprise-20261115/live-button-actions';
mkdirSync(shots, { recursive: true });
async function request(path, token, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(api + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60000),
  });
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); } catch { result = { detail: text.slice(0,300) }; }
  assert.ok(response.ok, path + ': HTTP ' + response.status + ' ' + JSON.stringify(result).slice(0,250));
  return result;
}
const login = await fetch(web + '/login', { signal: AbortSignal.timeout(60000) });
assert.equal(login.status, 200, 'the real Preview Web must load its login route');
const session = await request('/auth/register', null, {
  email: 'qa-preview-automation-' + randomUUID() + '@example.test',
  password: 'Qa-NonProduction-' + randomUUID(),
  fullName: 'Preview UI QA (synthetic)',
  workspaceName: 'QA isolated automation visual acceptance',
});
const token = session.accessToken;
const channel = await request('/channels', token, {type:'web', name:'Preview synthetic QA only'});
await request('/workspace/onboarding/complete', token, {});
const flow = await request('/flows', token, {name:'QA unpublished visual automation only',channelIds:[channel.id]});
const graph = { startNodeId:'pick', nodes:[
  {id:'pick',type:'interactive',position:{x:200,y:150},data:{text:'Synthetic QA only',buttons:[{id:'go',title:'Continue',actions:[]}]},edges:{'option:go':'done',fallback:'done'}},
  {id:'done',type:'end',position:{x:640,y:150},data:{},edges:{}},
]};
await request('/flows/'+flow.id,token,{graph,expectedUpdatedAt:flow.updated_at},'PATCH');
const browser = await chromium.launch({executablePath:process.env.BOAT_CHROMIUM || '/usr/bin/google-chrome',args:['--no-sandbox']});
const results=[];
try {
for(const language of ['ar','en'])for(const width of [390,1366]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:936}});
  await context.addInitScript(({session,language})=>{
    localStorage.setItem('session',JSON.stringify(session));
    localStorage.setItem('boat-language',language);
  },{session,language});
  const page=await context.newPage();
  page.setDefaultTimeout(22000);
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.goto(web+'/dashboard/flows/'+flow.id,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:language==='ar'?'المزيد من الأدوات':'More tools',exact:true}).click();
  await page.getByRole('button',{name:language==='ar'?'إظهار كل الخطوات':'Fit all steps',exact:true}).click();
  await page.getByRole('button',{name:language==='ar'?'المزيد من الأدوات':'More tools',exact:true}).click();
  await page.locator('.react-flow__node').filter({hasText:'Continue'}).last().click();
  const dialog=page.getByRole('dialog',{name:language==='ar'?'إعداد الاختيار':'Configure Reply',exact:true});
  await dialog.waitFor();
  await dialog.getByText(language==='ar'?'ماذا تريد أن يحدث تلقائيًا عندما يختار العميل هذا الرد؟':'What should happen automatically when the customer chooses this reply?',{exact:true}).waitFor();
  const add=dialog.getByRole('button',{name:language==='ar'?'إضافة حفظ حقل مخصص':'Add Save custom field'});
  await add.waitFor();
  if(language==='en'&&width===1366){
    await add.click();
    const item=dialog.locator('section[class*="actionItem"]').last();
    await item.getByRole('button',{name:'New field name or advanced setting'}).click();
    await item.getByLabel('Technical field key').fill('qa_visit');
    await item.getByLabel('Value (supports variables)').fill('yes');
    await dialog.screenshot({path:shots+'/live-en-1366-before-save.png'});
    await dialog.getByRole('button',{name:'Save Changes',exact:true}).click();
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('All changes saved',{exact:true}).waitFor();
    const saved=await request('/flows/'+flow.id,token);
    assert.equal(saved.draft_graph.nodes.find(n=>n.id==='pick').data.buttons[0].actions[0].key,'qa_visit');
    await page.reload();
    await page.getByRole('button',{name:'More tools',exact:true}).click();
    await page.getByRole('button',{name:'Fit all steps',exact:true}).click();
    await page.getByRole('button',{name:'More tools',exact:true}).click();
    await page.locator('.react-flow__node').filter({hasText:'Continue'}).last().click();
    await dialog.waitFor();
    assert.equal(await dialog.locator('section[class*="actionItem"]').count(),1,'saved automation action must reopen on real Preview');
    results.push({checkpoint:'real Preview saved and reopened action in synthetic tenant',status:'PASS'});
  }
  if(width===390)assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'no mobile sideways overflow');
  await dialog.screenshot({path:shots+'/live-'+language+'-'+width+'.png'});
  assert.deepEqual(errors,[],'no page JavaScript errors');
  results.push({language,width,status:'PASS',questionVisible:true,realRailwayWeb:true});
  await context.close();
}
  writeFileSync(shots+'/results.json',JSON.stringify({testAccount:'synthetic unpublished isolated QA tenant',noPublish:true,results},null,2));
  console.log(JSON.stringify({status:'PASS',realPreview:true,results:results.length}));
} finally { await browser.close(); }
