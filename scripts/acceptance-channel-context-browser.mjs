import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url),{chromium}=require(process.env.BOAT_PLAYWRIGHT_MODULE||'playwright-core');
if(process.env.BOAT_PREVIEW_ONLY!=='true'||process.env.EXTERNAL_DELIVERY_ENABLED!=='false')throw Error('Local preview required');
const base=process.env.SMOKE_API_URL||'http://localhost:4000',web=process.env.SMOKE_WEB_URL||'http://localhost:3000';
async function call(path,token,method='GET',body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;}
const a=await call('/auth/register',null,'POST',{email:randomUUID()+'@example.test',password:'local-context-12345',fullName:'Channel tester',workspaceName:'Channel context'});
const channels=[];
for(const suffix of ['A','B']){const ch=await call('/channels',a.accessToken,'POST',{type:'facebook',name:'Mock channel '+suffix,credentials:{pageId:randomUUID(),pageAccessToken:'not-a-real-provider-token'}});channels.push(ch);await call('/campaigns',a.accessToken,'POST',{name:'Campaign '+suffix,channelId:ch.id,content:{text:'Mock campaign'}});await call('/sequences',a.accessToken,'POST',{name:'Sequence '+suffix,channelId:ch.id,steps:[{id:'one',delay:{amount:30,unit:'minutes'},content:{text:'Mock'}}]});await call('/commerce/social',a.accessToken,'POST',{channelId:ch.id,kind:'text',body:'Post '+suffix});}
const browser=await chromium.launch({executablePath:process.env.BOAT_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(a=>{localStorage.setItem('session',JSON.stringify(a));localStorage.setItem('boat-language','en');},a);
 const id=channels[0].id;
 for(const [route,yes,no] of [['campaigns','Campaign A','Campaign B'],['sequences','Sequence A','Sequence B']]){await page.goto(web+'/dashboard/'+route+'?channelId='+id);await page.getByText(yes,{exact:true}).waitFor();assert.equal(await page.getByText(no,{exact:true}).count(),0);assert.equal(await page.getByRole('combobox',{name:'Channel context',exact:true}).inputValue(),id);}
 await page.goto(web+'/dashboard/commerce?channelId='+id);await page.getByRole('button',{name:'Social publishing',exact:true}).click();await page.getByText('Post A',{exact:true}).waitFor();assert.equal(await page.getByText('Post B',{exact:true}).count(),0);
 await page.locator('a[href="/dashboard/integrations?channelId='+id+'"]').first().click();await page.waitForURL('**/integrations?channelId='+id);await page.waitForFunction(value=>document.querySelector('select[aria-label="Channel context"]')?.value===value,id);assert.equal(await page.getByRole('combobox',{name:'Channel context',exact:true}).inputValue(),id);
 await page.getByRole('combobox',{name:'Channel context',exact:true}).selectOption(channels[1].id);assert.equal(new URL(page.url()).searchParams.get('channelId'),channels[1].id);await page.locator('a[href="/dashboard/campaigns?channelId='+channels[1].id+'"]').first().click();await page.getByText('Campaign B',{exact:true}).waitFor();assert.equal(await page.getByText('Campaign A',{exact:true}).count(),0);assert.deepEqual(errors,[]);
 console.log('PASS channel context Chromium: actual persisted campaigns/sequences/posts filtered by channel, cross-feature navigation retains scope and URL updates without external requests.');
}finally{await browser.close();}
