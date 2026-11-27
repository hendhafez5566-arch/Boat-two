import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {assertLocalAcceptance} from './acceptance-local.mjs';
assertLocalAcceptance();
const {chromium}=createRequire(import.meta.url)(process.env.BOAT_PLAYWRIGHT_MODULE||'playwright');
async function api(path,token,body){const r=await fetch('http://localhost:4000'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.ok(r.ok,path+' '+r.status);return r.json();}
const session=await api('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'Report browser',workspaceName:'Isolated report browser'}),token=session.accessToken;
const channel=await api('/channels',token,{type:'web',name:'Report browser'}),visitor=await api('/widget/'+channel.external_id+'/session',null,{});
const r=await fetch('http://localhost:4000/widget/'+channel.external_id+'/messages?visitorId='+visitor.visitorId,{method:'POST',headers:{'content-type':'application/json','x-visitor-token':visitor.token},body:JSON.stringify({text:'Synthetic report question',clientMsgId:uuid()})});assert.ok(r.ok);
await api('/workspace/onboarding/complete',token,{});
const cv=(await api('/conversations',token)).items[0];await api('/conversations/'+cv.id+'/notes',token,{text:'Internal note is not a measured reply'});
const browser=await chromium.launch({executablePath:process.env.BOAT_CHROMIUM||'/usr/bin/google-chrome',args:['--no-sandbox']}),results=[];mkdirSync('docs/p0-evidence/report-browser',{recursive:true});
try{for(const language of ['ar','en'])for(const width of [390,1366]){
 const context=await browser.newContext({viewport:{width,height:900}});await context.addInitScript(({session,language})=>{localStorage.setItem('session',JSON.stringify(session));localStorage.setItem('boat-language',language);},{session,language});
 const page=await context.newPage();await page.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 await page.goto('http://localhost:3000/dashboard/reports');await page.getByRole('button',{name:language==='ar'?'عرض التقارير':'View reports',exact:true}).click();
 const section=page.getByRole('region',{name:language==='ar'?'وقت أول رد بشري':'First human response time'});await section.waitFor();
 // Before the first staff reply, notes cannot manufacture an average.
 if(results.length===0){await section.getByText('لا توجد ردود بشرية مقاسة خلال الفترة',{exact:true}).waitFor();await api('/conversations/'+cv.id+'/messages',token,{text:'Synthetic human report reply'});await page.getByRole('button',{name:'عرض التقارير',exact:true}).click();await section.getByText('لا توجد ردود بشرية مقاسة خلال الفترة',{exact:true}).waitFor({state:'hidden'});}
 assert.ok((await section.textContent()).includes(language==='ar'?'ثانية':'seconds'));
 await page.getByRole('button',{name:language==='ar'?'نشاط الموظفين':'Employee activity',exact:true}).click();
 console.log('REPORT_HEADER_PROBE',language,width,await page.locator('#report-employees').ariaSnapshot());await page.screenshot({path:`docs/p0-evidence/report-browser/before-columns-${language}-${width}.png`});
 for(const label of language==='ar'?['رسائل موظف أُرسلت','محاولات موظف فاشلة','رسائل موظف في الطابور']:['Sent staff messages','Failed staff attempts','Queued staff messages'])await page.locator('#report-employees').getByRole('columnheader',{name:label,exact:true}).waitFor();
 const search=page.getByRole('searchbox',{name:language==='ar'?'بحث في النتائج المحملة':'Search loaded results'});await search.fill('not-a-real-employee-qa');await page.getByText(language==='ar'?'لا توجد نتائج مطابقة':'No matching results',{exact:true}).waitFor();await page.getByRole('button',{name:language==='ar'?'مسح البحث':'Clear search',exact:true}).click();await page.locator('#report-employees').getByRole('columnheader').first().waitFor();
 await page.getByText(language==='ar'?'طريقة احتساب التقارير والقيود':'Report methodology and limitations',{exact:true}).click();
 await page.getByText(language==='ar'?'إجمالي القنوات يستبعد ملاحظات الفريق والأحداث الداخلية. نشاط الموظف يعرض المحاولات مع فصل المُرسل والفاشل وما في الطابور؛ المُرسل لا يعني التسليم. حالات البوت ليست دليل حل المحادثة، ولا يتوفر قياس معتمد للوقت الموفّر بعد.':'Channel totals exclude team notes and internal events. Staff activity shows attempts with sent, failed and queued counts; sent does not mean delivered. Bot states do not establish conversation resolution; measured time savings are not available yet.',{exact:true}).waitFor();
 const nav=page.getByRole('navigation',{name:language==='ar'?'نوع التقرير':'Report type'});
 assert.equal(await nav.getByRole('button').count(),12);
 for(let i=0;i<12;i++){
  await nav.getByRole('button').nth(i).click();
  assert.equal(await nav.getByRole('button').nth(i).getAttribute('aria-pressed'),'true');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'report tab overflow '+i+' '+language+' '+width);
 }
 await nav.getByRole('button',{name:language==='ar'?'الرسائل اليومية':'Daily messages',exact:true}).click();
 const daily=page.locator('#report-daily');
 const bar=daily.locator('.report-chart-bars button').first();
 await bar.click();assert.equal(await bar.getAttribute('aria-pressed'),'true');
 await daily.getByRole('button',{name:language==='ar'?/عرض كل الأيام/:/Show all days/}).click();
 assert.equal(await bar.getAttribute('aria-pressed'),'false');
 const csv=daily.getByRole('button',{name:language==='ar'?'تصدير CSV':'Export CSV',exact:true});
 const [file]=await Promise.all([page.waitForEvent('download'),csv.click()]);
 assert.equal(file.suggestedFilename(),'daily.csv');
 const preset=page.getByRole('combobox',{name:language==='ar'?'فترة جاهزة':'Preset range'});
 await preset.selectOption('1');assert.ok(await csv.isDisabled());
 await page.getByRole('button',{name:language==='ar'?'عرض التقارير':'View reports',exact:true}).click();
 await section.waitFor();
 await page.getByRole('link',{name:language==='ar'?'تقارير العملاء':'CRM reports',exact:true}).click();
 await page.locator('[data-crm-report]').waitFor();
 await page.locator('#crm-metrics').waitFor();
 const crmExport=page.getByRole('button',{name:language==='ar'?'تصدير CSV':'Export CSV',exact:true});
 const [crmFile]=await Promise.all([page.waitForEvent('download'),crmExport.click()]);
 assert.equal(crmFile.suggestedFilename(),'boat-crm-report.csv');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`docs/p0-evidence/report-browser/${language}-${width}.png`});results.push({language,width,status:'PASS'});await context.close();
}}finally{await browser.close();writeFileSync('docs/p0-evidence/report-browser/results.json',JSON.stringify(results,null,2)+'\n');}
console.log('PASS measured report browser journeys',results.length);
