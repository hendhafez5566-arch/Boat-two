import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {assertLocalAcceptance} from './acceptance-local.mjs';
assertLocalAcceptance();
const {chromium}=createRequire(import.meta.url)(process.env.BOAT_PLAYWRIGHT_MODULE||'playwright');
const out='docs/p0-evidence/platform-admin';mkdirSync(out,{recursive:true});
const company={id:'11111111-1111-4111-8111-111111111111',name:'Synthetic Company',slug:'qa',plan_code:'pro',status:'active',suspended_at:null,members:2};
const user={id:'22222222-2222-4222-8222-222222222222',full_name:'Synthetic User',email:'user@example.test',session_version:0,disabled_at:null};
const plan={code:'pro',name:'Synthetic Pro',price_cents:1000,is_active:true,limits:{agents:5,contacts:100},features:{test:true}};
const permissions=['companies.read','companies.write','users.read','users.write','plans.read','plans.write','subscriptions.read','subscriptions.write','reports.read','audit.read','sessions.revoke','mfa.manage'];
const report={companies:{total:1,suspended:0},subscriptions:{active:1},queues:{pending:0},paidInvoicesByCurrency:[],invoiceCohortByCurrency:[],recurringByCurrency:[],paidInvoicesMissingPaymentDate:0,unpricedLinkedSubscriptions:0};
const browser=await chromium.launch({executablePath:process.env.BOAT_CHROMIUM||'/usr/bin/google-chrome',args:['--no-sandbox']}),results=[];
try{for(const language of ['ar','en'])for(const width of [390,1366]){
 const context=await browser.newContext({viewport:{width,height:936}});
 await context.addInitScript(l=>localStorage.setItem('boat-language',l),language);
 const page=await context.newPage(),errors=[],calls=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async r=>{
 const url=new URL(r.request().url());if(!['localhost','127.0.0.1'].includes(url.hostname))return r.abort();
 if(url.port!=='4000'||!url.pathname.startsWith('/platform'))return r.continue();
 const p=url.pathname.slice('/platform'.length),method=r.request().method();calls.push({p,method});
 const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','content-type':'application/json'};
 if(method==='OPTIONS')return r.fulfill({status:204,headers});
 let data;
 if(p==='/login')data={accessToken:'synthetic-browser-fixture-only'};
 else if(p==='/session')data={actor:user.id,permissions};
 else if(p==='')data={companies:[company],users:[user],plans:[plan],audit:[]};
 else if(p==='/directory')data={items:url.searchParams.get('kind')==='companies'?[company]:[user],total:1};
 else if(p==='/reports')data=report;
 else if(p==='/prices'||p==='/billing-reviews')data=[];
 else if(p==='/audit')data={items:[],nextCursor:null};
 else return r.fulfill({status:403,headers,body:JSON.stringify({message:'No mutations in visual fixture'})});
 return r.fulfill({status:200,headers,body:JSON.stringify(data)});
 });
 const t=(ar,en)=>language==='ar'?ar:en;
 await page.goto('http://localhost:3000/platform');
 assert.ok((await page.locator('main>header').evaluate(el=>getComputedStyle(el).backgroundImage)).includes('linear-gradient'));
 await page.screenshot({path:out+'/login-'+language+'-'+width+'.png',fullPage:true});
 const login=page.locator('main>form');
 await login.locator('input[name=email]').fill('operator@example.test');await login.locator('input[name=password]').fill('SyntheticPassword');await login.locator('input[name=otp]').fill('123456');
 await login.getByRole('button',{name:t('دخول مستقل','Platform sign-in')}).click();
 const nav=page.getByRole('navigation',{name:t('أقسام المنصة','Platform sections')});
 await nav.waitFor();assert.equal(await nav.getByRole('button').count(),8);
 const labels=[['overview','نظرة عامة','Overview'],['companies','الشركات والاشتراكات','Companies & subscriptions'],['users','المستخدمون','Users'],['plans','الباقات والأسعار','Plans & prices'],['billing','الفوترة','Billing'],['reports','التقارير','Reports'],['audit','سجل العمليات','Audit log'],['security','أمان الحساب','Account security']];
 for(const [id,ar,en] of labels){
 await nav.getByRole('button',{name:t(ar,en),exact:true}).click();
 const section=page.locator('[data-platform-section='+id+']');await section.waitFor();
 if(id==='companies'||id==='users'||id==='plans'){const details=section.locator('details').first();await details.locator('summary').click();}
 if(id==='plans')await section.getByText(t('لا توجد أسعار مطابقة','No matching prices'),{exact:true}).waitFor();
 if(id==='billing')await section.getByText(t('لا توجد نتائج مطابقة للمراجعة','No matching reviews'),{exact:true}).waitFor();
 if(id==='reports')await section.getByText(t('لا توجد فواتير مسددة في الفترة','No paid invoices in range'),{exact:true}).waitFor();
 if(id==='audit')await section.getByText(t('لا توجد عمليات ضمن الفلاتر.','No operations match these filters.'),{exact:true}).waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+id+' '+width);
 await page.screenshot({path:out+'/'+id+'-'+language+'-'+width+'.png',fullPage:true});
 }
 assert.deepEqual(errors,[]);assert.ok(calls.every(c=>['GET','OPTIONS'].includes(c.method)||c.p==='/login'));
 results.push({language,width,sections:8,status:'PASS',mode:'mocked platform API visual fixture'});
 await context.close();
}}finally{await browser.close();writeFileSync(out+'/results.json',JSON.stringify(results,null,2));}
console.log('PASS platform admin visual fixture',results.length);
