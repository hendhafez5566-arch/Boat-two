import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {assertLocalAcceptance} from './acceptance-local.mjs';
assertLocalAcceptance();
const base='http://localhost:4000',web='http://localhost:3000',out='docs/p0-evidence/social-professional';mkdirSync(out,{recursive:true});
const {chromium}=createRequire(import.meta.url)(process.env.BOAT_PLAYWRIGHT_MODULE||'playwright');
async function api(path,token,body,method=body?'POST':'GET',expected){const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(expected)assert.equal(r.status,expected,path+' '+JSON.stringify(d));else assert.ok(r.ok,path+' '+r.status+' '+JSON.stringify(d));return d;}
const browser=await chromium.launch({executablePath:process.env.BOAT_CHROMIUM||'/usr/bin/google-chrome',args:['--no-sandbox']}),results=[];
try{for(const language of ['ar','en'])for(const width of [390,1366]){
 const t=(ar,en)=>language==='ar'?ar:en,session=await api('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'Social QA',workspaceName:'Isolated social QA'}),token=session.accessToken;
 const fb=await api('/channels',token,{type:'facebook',name:'Synthetic Facebook',credentials:{pageId:uuid(),pageAccessToken:'synthetic-only'}});
 const ig=await api('/channels',token,{type:'instagram',name:'Synthetic Instagram',credentials:{igAccountId:uuid(),pageAccessToken:'synthetic-only'}});
 await api('/workspace/onboarding/complete',token,{});
 const context=await browser.newContext({viewport:{width,height:936}});await context.addInitScript(({session,language})=>{localStorage.setItem('session',JSON.stringify(session));localStorage.setItem('boat-language',language);},{session,language});
 const page=await context.newPage();page.setDefaultTimeout(25000);const errors=[];page.on('pageerror',e=>errors.push(e.message));let external=0;await page.route('**/*',r=>{if(['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname))return r.continue();external++;return r.abort();});
 await page.goto(web+'/dashboard/social');await page.locator('[data-format="multimedia"]').waitFor();assert.equal(await page.locator('[data-format]').count(),3);
 for(const [format,kind,expected,account] of [['multimedia','text','text',fb],['multimedia','link','text',fb],['multimedia','image','image',ig],['multimedia','image','carousel',fb],['multimedia','video','video',ig],['cta','cta','cta',fb],['carousel','carousel','carousel',fb],['carousel','video','video',fb]]){
  await page.goto(web+'/dashboard/social/'+format);await page.getByRole('link',{name:/إنشاء منشور جديد|Create New Post/}).click();
  const name='QA '+format+' '+expected+' '+(kind==='link'?'link':'draft'),select=page.getByRole('combobox',{name:t('الصفحة أو الحساب','Page or account'),exact:true});
  await select.selectOption(account.id);
  const typeLabels={text:t('نص','Text'),link:t('رابط','Link'),image:t('صورة / صور متعددة','Image / Carousel'),video:t('فيديو','Video'),carousel:t('صور متعددة','Carousel'),cta:t('دعوة لاتخاذ إجراء','Call to action')};
  const group=page.getByRole('group',{name:t('نوع المنشور','Post type')});
  if(account.id===ig.id)assert.ok(await group.getByRole('button',{name:typeLabels.text,exact:true}).isDisabled());
  await group.getByRole('button',{name:typeLabels[kind],exact:true}).click();
  await page.getByRole('textbox',{name:t('اسم الحملة','Campaign Name'),exact:true}).fill(name);
  await page.getByRole('textbox',{name:t('النص','Text'),exact:true}).fill('Synthetic post content '+expected);
  const save=page.getByRole('button',{name:t('حفظ مسودة','Save Draft'),exact:true});
  if(['image','video','carousel'].includes(kind)){
   const media=page.getByRole('textbox',{name:t('رابط الوسائط HTTPS — كل رابط في سطر','HTTPS media URLs — one per line'),exact:true});
   assert.ok(await save.isDisabled());await media.fill('http://example.test/not-https');assert.ok(await save.isDisabled());
   await media.fill(expected==='carousel'?'https://example.test/a.png\nhttps://example.test/b.png':kind==='video'?'https://example.test/a.mp4':'https://example.test/a.png');
  }
  if(['link','cta'].includes(kind))await page.getByRole('textbox',{name:t('الرابط','Link'),exact:true}).fill('https://example.test/landing');
  let asked=false;page.once('dialog',d=>{asked=true;return d.dismiss();});await page.getByRole('link',{name:t('رجوع','Back'),exact:true}).click();assert.ok(asked);
  assert.ok(await save.isEnabled());await save.click();
  const row=page.getByRole('row').filter({hasText:name});await row.waitFor();
  const data=await api('/commerce/social/index?'+new URLSearchParams({format,q:name}),token);assert.equal(data.total,1);const saved=data.items[0];assert.equal(saved.kind,expected);assert.equal(saved.status,'draft');assert.equal(saved.channel_id,account.id);assert.equal(saved.format,format);
  assert.ok(await row.getByRole('button',{name:t('جدولة','Schedule'),exact:true}).isDisabled());await api('/commerce/social/'+saved.id+'/queue',token,{confirm:true,scheduledAt:new Date(Date.now()+86400000).toISOString()},'POST',400);
  await row.getByRole('button',{name:t('عرض','View'),exact:true}).click();const dialog=page.getByRole('dialog',{name:t('معاينة المنشور','Post preview')});await dialog.getByText('Synthetic post content '+expected,{exact:true}).waitFor();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await row.getByRole('link',{name:t('تعديل','Edit'),exact:true}).click();await page.getByRole('textbox',{name:t('اسم الحملة','Campaign Name'),exact:true}).fill(name+' edited');await save.click();
  const updated=page.getByRole('row').filter({hasText:name+' edited'});await updated.waitFor();
  assert.equal((await api('/commerce/social/'+saved.id+'/detail',token)).name,name+' edited');
  await page.getByRole('searchbox',{name:t('بحث المنشورات','Search posts'),exact:true}).fill('not-found-qa');await updated.waitFor({state:'hidden'});
  await page.getByRole('button',{name:t('مسح الفلاتر','Clear filters'),exact:true}).click();await updated.waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page overflow');
  await page.screenshot({path:out+'/'+format+'-'+kind+'-'+expected+'-'+language+'-'+width+'.png',fullPage:true});results.push({language,width,format,kind,expected,status:'PASS'});
 }
 assert.equal(external,0,'drafts and unopened media previews must not contact outside servers');assert.deepEqual(errors,[]);await context.close();
}}finally{await browser.close();writeFileSync(out+'/results.json',JSON.stringify(results,null,2)+'\n');}
console.log('PASS all social formats, draft/edit/preview/filter/blocked publishing journeys',results.length);
