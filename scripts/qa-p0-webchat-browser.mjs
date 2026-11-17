import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {assertLocalAcceptance} from './acceptance-local.mjs';
assertLocalAcceptance();
const {chromium}=createRequire(import.meta.url)(process.env.BOAT_PLAYWRIGHT_MODULE||'playwright');
const base='http://localhost:4000';
async function api(path,token,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.ok(r.ok,path+' '+r.status);return r.json();}
const browser=await chromium.launch({executablePath:process.env.BOAT_CHROMIUM||'/usr/bin/google-chrome',args:['--no-sandbox']});const results=[];
mkdirSync('docs/p0-evidence/webchat-browser',{recursive:true});
try{for(const language of ['ar','en'])for(const width of [390,1366]){
 const owner=await api('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'Widget recovery',workspaceName:'Isolated widget recovery'});
 const token=owner.accessToken,ch=await api('/channels',token,{type:'web',name:'Isolated '+language});
 const settingsResponse=await fetch(base+'/channels/'+ch.id,{method:'PATCH',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({settings:{direction:language==='ar'?'rtl':'ltr'}})});assert.ok(settingsResponse.ok);
 const visitor=await api('/widget/'+ch.external_id+'/session',null,{});
 const inbound=await fetch(base+'/widget/'+ch.external_id+'/messages?visitorId='+visitor.visitorId,{method:'POST',headers:{'content-type':'application/json','x-visitor-token':visitor.token},body:JSON.stringify({text:language==='ar'?'رسالة عربية':'English message',clientMsgId:uuid()})});assert.ok(inbound.ok);
 const cv=(await api('/conversations',token)).items[0];
 for(let i=0;i<105;i++)await api('/conversations/'+cv.id+'/messages',token,{text:'History '+i+' '+language});
 await api('/conversations/'+cv.id+'/notes',token,{text:'PRIVATE-WIDGET-NOTE'});
 const form=new FormData();form.append('file',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jz1sAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'pixel.png');
 const uploaded=await fetch(base+'/uploads',{method:'POST',headers:{authorization:'Bearer '+token},body:form});assert.ok(uploaded.ok);const media=await uploaded.json();
 await api('/conversations/'+cv.id+'/messages',token,{media:{kind:media.kind,url:media.url,filename:media.filename,caption:'Synthetic image'}});
 const ctx=await browser.newContext({viewport:{width,height:840}});
 await ctx.addInitScript(({key,id})=>localStorage.setItem('cb_visitor_'+key,id),{key:ch.external_id,id:visitor.visitorId});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 await page.route(base+'/p0-widget',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${language}" dir="${language==='ar'?'rtl':'ltr'}"><body><script src="${base}/widget.js" data-key="${ch.external_id}"></script></body></html>`}));
 await page.goto(base+'/p0-widget');await page.locator('.launcher').click();
 await page.getByText('History 104 '+language,{exact:true}).waitFor();
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('body > div')).some(h=>h.shadowRoot?.querySelector('img')?.naturalWidth>0));
 assert.equal(await page.getByText('PRIVATE-WIDGET-NOTE').count(),0);
 await ctx.setOffline(true);await api('/conversations/'+cv.id+'/messages',token,{text:'Recovered after offline '+language});
 await ctx.setOffline(false);await page.getByText('Recovered after offline '+language,{exact:true}).waitFor({timeout:15000});
 await page.reload();await page.locator('.launcher').click();await page.getByText('History 104 '+language,{exact:true}).waitFor();await page.getByText('Recovered after offline '+language,{exact:true}).waitFor();
 assert.equal(await page.getByText('History 104 '+language,{exact:true}).count(),1);assert.deepEqual(errors,[]);
 await page.screenshot({path:`docs/p0-evidence/webchat-browser/${language}-${width}.png`});results.push({language,width,status:'PASS',checks:['105-message history','actual uploaded PNG renders','private notes excluded','offline reconnect','reload persistence and no duplicates']});await ctx.close();
}}finally{await browser.close();writeFileSync('docs/p0-evidence/webchat-browser/results.json',JSON.stringify(results,null,2)+'\n');}
console.log('PASS Webchat browser journeys',results.length);
