import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {assertLocalAcceptance} from './acceptance-local.mjs';
assertLocalAcceptance();
const {chromium}=createRequire(import.meta.url)(process.env.BOAT_PLAYWRIGHT_MODULE||'playwright');
async function api(path,token,body){const r=await fetch('http://localhost:4000'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();assert.ok(r.ok,path+' '+r.status);return d;}
const session=await api('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'Manager QA',workspaceName:'Isolated manager QA'}),token=session.accessToken;
const channel=await api('/channels',token,{type:'web',name:'Professional QA website'});
await api('/workspace/onboarding/complete',token,{});
const flow=await api('/flows',token,{name:'Professional QA draft',channelIds:[channel.id]});
const out='docs/p0-evidence/bot-manager-professional';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.BOAT_CHROMIUM||'/usr/bin/google-chrome',args:['--no-sandbox']}),results=[];
try{for(const language of ['ar','en'])for(const width of [390,1366]){
 const t=(ar,en)=>language==='ar'?ar:en,context=await browser.newContext({viewport:{width,height:936}});
 await context.addInitScript(({session,language})=>{localStorage.setItem('session',JSON.stringify(session));localStorage.setItem('boat-language',language);},{session,language});
 const page=await context.newPage();await page.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 await page.goto('http://localhost:3000/dashboard/flows?section=bot_reply&channelId='+channel.id);
 const row=page.getByRole('row').filter({hasText:'Professional QA draft'});await row.waitFor();
 const search=page.getByRole('searchbox',{name:t('البحث في التدفقات','Search flows')});
 await search.fill(flow.id);await row.waitFor();
 await search.fill('no-such-flow-qa');await row.waitFor({state:'hidden'});
 await page.getByRole('button',{name:t('مسح الفلاتر','Clear filters')}).click();await row.waitFor();
 const status=page.getByRole('combobox',{name:t('حالة التدفق','Flow status')});
 await status.selectOption('published');await row.waitFor({state:'hidden'});
 await status.selectOption('draft');await row.waitFor();
 const more=row.locator('details.flow-more');await more.locator('summary').click();assert.equal(await more.getAttribute('open'),'');
 await page.keyboard.press('Escape');assert.equal(await more.getAttribute('open'),null);
 await more.locator('summary').click();await search.click();assert.equal(await more.getAttribute('open'),null);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:out+'/manager-'+language+'-'+width+'.png'});
 results.push({language,width,status:'PASS'});await context.close();
}}finally{await browser.close();writeFileSync(out+'/results.json',JSON.stringify(results,null,2)+'\n');}
console.log('PASS manager search, status, menus and responsive journeys',results.length);
