import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import {assertLocalAcceptance} from './acceptance-local.mjs';
assertLocalAcceptance();
const {chromium}=createRequire(import.meta.url)(process.env.BOAT_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:process.env.BOAT_CHROMIUM||'/usr/bin/google-chrome',args:['--no-sandbox']});
const out='docs/p0-evidence/platform-admin';mkdirSync(out,{recursive:true});
try{for(const language of ['ar','en'])for(const width of [390,1366]){
 const context=await browser.newContext({viewport:{width,height:936}});await context.addInitScript(l=>localStorage.setItem('boat-language',l),language);
 const page=await context.newPage(),calls=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.port==='4000'&&u.pathname.startsWith('/platform')){calls.push(u.pathname);return r.abort();}return ['localhost','127.0.0.1'].includes(u.hostname)?r.continue():r.abort();});
 const t=(a,b)=>language==='ar'?a:b;
 const publicPlans=await fetch('http://localhost:4000/plans').then(r=>{assert.ok(r.ok);return r.json();});assert.ok(publicPlans.length);
 await page.goto('http://localhost:3000/platform');
 const nav=page.getByRole('navigation',{name:t('أقسام المنصة','Platform sections')});await nav.waitFor();assert.equal(await nav.getByRole('button').count(),9);assert.equal(await page.locator('input[name=password]').count(),0);
 for(const [id,ar,en] of [['overview','نظرة عامة','Overview'],['companies','الشركات والاشتراكات','Companies & subscriptions'],['users','المستخدمون','Users'],['plans','الباقات والأسعار','Plans & prices'],['billing','الفوترة','Billing'],['reports','التقارير','Reports'],['audit','سجل العمليات','Audit log'],['registration','إعدادات التسجيل','Registration settings'],['security','أمان الحساب','Account security']]){
 await nav.getByRole('button',{name:t(ar,en),exact:true}).click();const section=page.locator('[data-platform-section='+id+']');await section.waitFor();
 if(id==='companies'){await section.locator('[data-variant=row] [data-record-editor]').first().click();const modal=page.getByRole('dialog');await modal.locator('input[name=name]').fill('Edited Demo Company');await modal.locator('input[name=reason]').first().fill('Synthetic review change');page.once('dialog',d=>d.dismiss());await modal.getByRole('button',{name:t('إغلاق','Close'),exact:true}).click();assert.equal(await modal.locator('input[name=name]').inputValue(),'Edited Demo Company');page.once('dialog',d=>d.accept());await modal.getByRole('button',{name:t('حفظ الشركة','Save company'),exact:true}).click();await modal.getByText(t('تمت العملية.','Operation completed.'),{exact:true}).waitFor();await modal.getByRole('button',{name:t('إغلاق','Close'),exact:true}).click();await modal.waitFor({state:'hidden'});await section.getByText('Edited Demo Company',{exact:true}).waitFor();await section.getByLabel(t('حالة الشركة','Company status')).selectOption('trialing');await section.getByText('Edited Demo Company',{exact:true}).waitFor({state:'hidden'});await section.getByText('Sample Studio',{exact:true}).waitFor();assert.equal(await section.locator('[data-variant=row] [data-record-editor]').count(),1);await section.getByLabel(t('حالة الشركة','Company status')).selectOption('');await section.getByText('Edited Demo Company',{exact:true}).waitFor();}
 if(id==='plans'){for(const plan of publicPlans)await section.locator('[data-variant=plan]').getByText(plan.name,{exact:true}).first().waitFor();const paid=publicPlans.find(p=>p.price_cents>0);if(paid)await section.getByText(paid.code+' · price_demo_'+paid.code,{exact:true}).waitFor();}
 if(id==='billing'){await section.getByText('Demo Company',{exact:true}).waitFor();await section.locator('[data-record-editor]').first().click();const modal=page.getByRole('dialog');await modal.getByText(t('الدليل جاهز','Evidence ready'),{exact:true}).waitFor();await modal.getByRole('button',{name:t('إغلاق','Close'),exact:true}).click();await modal.waitFor({state:'hidden'});}
 if(id==='registration'){const field=section.getByLabel(t('مدة التجربة بالأيام','Trial days'));await field.fill('21');await section.getByLabel(t('سبب التغيير','Change reason')).fill('Synthetic policy review');await section.getByRole('button',{name:t('حفظ سياسة التسجيل','Save registration policy')}).click();await section.getByText(t('تم حفظ سياسة التسجيل','Registration policy saved'),{exact:true}).waitFor();}
 if(id==='reports')await section.getByText(t('الفواتير المنشأة خلال الفترة','Invoice creation cohort'),{exact:true}).waitFor();
 if(id==='audit')await section.getByText('demo.company.review',{exact:true}).waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+id+' '+width);
 assert.ok(await section.evaluate(el=>Array.from(el.querySelectorAll('input:not([type=checkbox]),select')).filter(x=>x.getClientRects().length).every(x=>x.getBoundingClientRect().height<=48)),'oversized inputs '+id+' '+width);
 if(width===1366)assert.ok(await section.evaluate(el=>el.getBoundingClientRect().top<260),'oversized shell '+id);
 await page.screenshot({path:out+'/open-'+id+'-'+language+'-'+width+'.png',fullPage:true});
 }
 assert.deepEqual(calls,[]);assert.deepEqual(errors,[]);await context.close();
}}finally{await browser.close();}
console.log('PASS direct open review, all eight sections, local editing and zero platform API calls');
