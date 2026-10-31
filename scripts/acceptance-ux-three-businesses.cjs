/* eslint-disable */
// Real UI and isolated controllers/PostgreSQL; no external channel delivery.
const assert = require('node:assert/strict'), fs = require('node:fs');
const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright');
(async () => {
 const tokens = await (await fetch('http://127.0.0.1:4000/fixture/tokens')).json();
 const browser = await chromium.launch({headless:true, executablePath:process.env.BOAT_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const out='docs/acceptance/2026-10-31-ux'; fs.mkdirSync(out,{recursive:true});
 const businesses=[
  {key:'owner',name:'شركة سياحة اختبار',csv:'id,name,category,price,visible\nt1,برنامج عمرة,رحلات,12000,true\n',item:'برنامج عمرة'},
  {key:'other',name:'مطعم اختبار',csv:'sku,name,category,size,price,visible\nr1,بيتزا,طعام,كبير,150,true\n',item:'بيتزا'},
  {key:'store',name:'متجر اختبار',csv:'code,name,category,color,size,price,visible\ns1,قميص,ملابس,أزرق,L,300,true\n',item:'قميص'}
 ];
 const sourceIds=[];
 try { for(const business of businesses) {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(token=>{localStorage.setItem('session',JSON.stringify({accessToken:token,refreshToken:'fixture'}));localStorage.setItem('boat-language','ar');},tokens[business.key]);
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:3000/dashboard/commerce');
  await page.getByRole('button',{name:'مصادر البيانات',exact:true}).click();
  await page.getByLabel('اسم المصدر',{exact:true}).fill(business.name);
  await page.waitForFunction(() => !document.querySelector('input[type=file]').disabled);
    await page.locator('input[type=file]').setInputFiles({name:business.key+'.csv',mimeType:'text/csv',buffer:Buffer.from(business.csv)});
  await page.getByRole('combobox',{name:'الاسم',exact:true}).selectOption('name');
  // Stable ID, name and category are detected; price remains a deliberate public-field choice.
  assert.equal(await page.getByRole('combobox',{name:'المعرف الثابت',exact:true}).inputValue(),business.csv.split(',')[0]);
  await page.getByRole('checkbox',{name:'price',exact:true}).check();
  await page.getByRole('button',{name:'مراجعة معاينة العميل',exact:true}).click();
  await page.getByRole('button',{name:'تطبيق التحديث المعروض',exact:true}).click();
  await page.getByRole('button',{name:'تطبيق التحديث المعروض',exact:true}).waitFor({state:'hidden'});
  await page.getByText('price: '+({owner:'12000',other:'150',store:'300'}[business.key]),{exact:true}).waitFor();
  const api=async(path,body,method='POST')=>{const response=await fetch('http://127.0.0.1:4000'+path,{method,headers:{Authorization:'Bearer '+tokens[business.key],'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});assert.ok(response.ok,await response.clone().text());return response.json();};
  const sources=await api('/commerce/sources',null,'GET');assert.equal(sources.length,1);sourceIds.push(sources[0].id);
  for(const id of sourceIds.slice(0,-1)){const r=await fetch('http://127.0.0.1:4000/commerce/sources/'+id+'/items',{headers:{Authorization:'Bearer '+tokens[business.key]}});assert.equal(r.status,404);}
  if (business.key !== 'owner') assert.ok(!(await page.locator('body').innerText()).includes('عمرة'));
  if (business.key === 'owner' || business.key === 'other') {
    const oldPrice=business.key === 'owner' ? '12000' : '150', newPrice=business.key === 'owner' ? '13000' : '175';
    await page.waitForFunction(() => !document.querySelector('input[type=file]').disabled);
    await page.locator('input[type=file]').setInputFiles({name:'updated.csv',mimeType:'text/csv',buffer:Buffer.from(business.csv.replace(oldPrice,newPrice))});
    await page.getByRole('button',{name:'مراجعة معاينة العميل',exact:true}).click();
    await page.getByRole('button',{name:'تطبيق التحديث المعروض',exact:true}).click();
    await page.getByRole('button',{name:'تطبيق التحديث المعروض',exact:true}).waitFor({state:'hidden'});
    await page.getByText('price: '+newPrice,{exact:true}).waitFor();
  } else {
    for (const visible of ['true','false']) {
      await page.waitForFunction(() => !document.querySelector('input[type=file]').disabled);
    await page.locator('input[type=file]').setInputFiles({name:'updated.csv',mimeType:'text/csv',buffer:Buffer.from(business.csv+'s2,حذاء,ملابس,أبيض,M,450,'+visible+'\n')});
      await page.getByRole('button',{name:'مراجعة معاينة العميل',exact:true}).click();
      if (visible === 'false') {
        await page.getByRole('checkbox',{name:'راجعت العناصر المخفية في هذا التحديث',exact:true}).waitFor();
        assert.ok(await page.getByRole('button',{name:'تطبيق التحديث المعروض',exact:true}).isDisabled());
        await page.getByRole('checkbox',{name:'راجعت العناصر المخفية في هذا التحديث',exact:true}).check();
      }
      await page.getByRole('button',{name:'تطبيق التحديث المعروض',exact:true}).click();
      await page.getByRole('button',{name:'تطبيق التحديث المعروض',exact:true}).waitFor({state:'hidden'});
      const items=await api('/commerce/sources/'+sources[0].id+'/items',null,'GET');
      assert.equal(items.total,visible === 'true' ? 2 : 1);
    }
  }
  const flow=await api('/flows',{name:business.name,language:'ar'});
  const graph={startNodeId:'catalog',nodes:[{id:'catalog',type:'catalog',position:{x:0,y:0},data:{text:'اختر المنتج',sourceId:sources[0].id,native:false,productIds:[],category:business.csv.split('\n')[1].split(',')[2],selectable:true,fields:['price']},edges:{next:'handoff'}},{id:'handoff',type:'handoff',position:{x:400,y:0},data:{message:'سيتابعك الموظف'},edges:{}}]};
  await api('/flows/'+flow.id,{graph},'PATCH');await api('/flows/'+flow.id+'/publish',{}); const saved = await api('/flows/'+flow.id,null,'GET');
  let trial = await api('/flows/'+flow.id+'/test',{text:'hello'});
  const first = trial.transcript.find(t=>t.role === 'bot').content.list.sections[0].rows[0];
  assert.equal(first.title,business.item);
  trial = await api('/flows/'+flow.id+'/test',{text:first.title,replyId:first.id,state:trial.state,contactAttributes:trial.contactAttributes});
  assert.ok(trial.contactAttributes.catalogSelection);
  assert.ok(trial.transcript.some(t=>String(t.content).includes('Handed off')));
  await page.goto('http://localhost:3000/dashboard/flows/'+flow.id);
  await page.getByRole('button',{name:'نشر التحديث',exact:true}).waitFor();
  assert.ok(await page.getByRole('button',{name:'نشر التحديث',exact:true}).isVisible());
  await page.locator('.react-flow__node[data-id="catalog"]').click();
  await page.getByRole('button',{name:'تعديل الخطوة',exact:true}).click();
  await page.getByRole('button',{name:'إضافة أو تحديث مصدر البيانات',exact:true}).click();
  await page.getByRole('dialog', {name:'كتالوج البوت',exact:true}).waitFor();
  await page.screenshot({path:out+'/'+business.key+'-catalog-in-builder.png'});
  await page.getByRole('button',{name:'Close / إغلاق',exact:true}).last().click();
  const after=await api('/flows/'+flow.id,null,'GET');assert.deepEqual(after.draft_graph,saved.draft_graph);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'/'+business.key+'-mobile.png'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]); await context.close();
 }
 console.log('PASS: three independent businesses, automatic column suggestions, customer preview/apply, RLS isolation, flow save/publish, embedded source dialog, graph preservation and RTL mobile');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
