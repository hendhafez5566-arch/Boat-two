// Only the fixed Preview hosts and a newly-created synthetic workspace; no file operations or provider traffic.
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
assert.equal(process.env.BOAT_APPROVED_LIVE_CATALOG_QA,'true');
const web='https://boat-preview-web-preview.up.railway.app',base='https://boat-preview-api-preview.up.railway.app',out='docs/p0-evidence/live-catalog-handover';
const {chromium}=createRequire(import.meta.url)(process.env.BOAT_PLAYWRIGHT_MODULE||'playwright');
async function api(path,token,body){
 const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
 assert.ok(r.ok,path+' HTTP '+r.status);return r.json();
}
const session=await api('/auth/register',null,{email:'qa-catalog-handover-'+uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'Synthetic catalog acceptance',workspaceName:'QA catalog handover — synthetic only'});
const channel=await api('/channels',session.accessToken,{type:'web',name:'QA synthetic catalog only'});await api('/workspace/onboarding/complete',session.accessToken,{});
const category=await api('/commerce/categories',session.accessToken,{name:'Synthetic catalog — 23 products'}),empty=await api('/commerce/categories',session.accessToken,{name:'Synthetic empty category'});
for(let i=1;i<=23;i++)await api('/commerce/products',session.accessToken,{name:'Synthetic product '+String(i).padStart(2,'0'),sku:'handover-'+i,description:'Synthetic acceptance data only',priceCents:'12000',currency:'EGP',categoryId:category.id});
const browser=await chromium.launch({executablePath:process.env.BOAT_CHROMIUM||'/usr/bin/google-chrome',args:['--no-sandbox']}),results=[];mkdirSync(out,{recursive:true});
try{for(const language of ['ar','en'])for(const width of [320,390,1366]){
 const t=(ar,en)=>language==='ar'?ar:en;
 const context=await browser.newContext({viewport:{width,height:936}});await context.addInitScript(({session,language})=>{localStorage.setItem('session',JSON.stringify(session));localStorage.setItem('boat-language',language);},{session,language});
 const p=await context.newPage();p.setDefaultTimeout(30000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>[web,base].includes(new URL(r.request().url()).origin)?r.continue():r.abort());
 await p.goto(web+'/dashboard/flows?channelId='+channel.id+'&section=product_catalog');
 const list=p.getByLabel(t('قائمة المنتجات','Product list'),{exact:true});await list.getByRole('heading',{name:'Synthetic product 01',exact:true}).waitFor();assert.equal(await list.locator('article').count(),10);
 const pages=p.getByRole('navigation',{name:t('صفحات المنتجات','Product pages'),exact:true});
 await pages.getByRole('button',{name:t('الصفحة 2','Page 2'),exact:true}).click();await list.getByRole('heading',{name:'Synthetic product 11',exact:true}).waitFor();assert.equal(await list.locator('article').count(),10);
 await pages.getByRole('button',{name:t('التالي','Next'),exact:true}).click();await list.getByRole('heading',{name:'Synthetic product 21',exact:true}).waitFor();assert.equal(await list.locator('article').count(),3);
 assert.ok(await pages.getByRole('button',{name:t('التالي','Next'),exact:true}).isDisabled());
 await pages.getByRole('button',{name:t('الصفحة 1','Page 1'),exact:true}).click();await list.locator('article').first().getByRole('button',{name:t('تعديل','Edit'),exact:true}).click();
 const dialog=p.getByRole('dialog',{name:t('تعديل المنتج','Edit product'),exact:true});await dialog.getByLabel(t('السعر *','Price *'),{exact:true}).fill('120.05');await dialog.getByRole('button',{name:t('حفظ المنتج','Save product'),exact:true}).click();
 const toast=p.getByText(t('تم حفظ المنتج.','Product saved.'),{exact:true});await toast.waitFor();assert.equal(await toast.evaluate(el=>getComputedStyle(el.parentElement).backgroundColor),'rgb(237, 249, 242)');await p.screenshot({path:`${out}/saved-${language}-${width}.png`});await toast.waitFor({state:'hidden',timeout:5000});
 await p.reload();await list.getByRole('heading',{name:'Synthetic product 01',exact:true}).waitFor();await list.locator('article').first().getByText('120.05 EGP',{exact:true}).waitFor();assert.equal(await list.locator('article').count(),10);
 const chooser=p.getByLabel(t('اختر قسم المنتجات','Choose product category'),{exact:true});await chooser.selectOption(empty.id);await p.getByRole('heading',{name:t('لا توجد منتجات تطابق الفلاتر','No products match these filters'),exact:true}).waitFor();await chooser.selectOption(category.id);await list.getByRole('heading',{name:'Synthetic product 01',exact:true}).waitFor();
 assert.equal(await pages.getByRole('button',{name:t('الصفحة 1','Page 1'),exact:true}).getAttribute('aria-current'),'page');assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 await p.screenshot({path:`${out}/catalog-${language}-${width}.png`});results.push({language,width,pages:[10,10,3],liveUiEditAndReload:true,greenToastDismissed:true,categoryReset:true,noOverflow:true});await context.close();
}
writeFileSync(out+'/results.json',JSON.stringify({status:'PASS',realPreview:true,syntheticTenantOnly:true,noFilesReadOrChanged:true,noDeletes:true,noBotsPublished:true,noExternalMessages:true,results},null,2)+'\n');console.log('PASS live deployed catalog — six AR/EN responsive pagination/edit/reload/toast journeys');
}finally{await browser.close();}
