// All records are fictional. The design console never calls platform APIs.
type DesignBody={name:string;suspended:boolean;planCode:string;status:string;disabled:boolean;enabled:boolean;limits:Record<string,number>;features:Record<string,boolean>;code:string;templateCode:string;priceId:string;amountCents:number;currency:string;interval:string};
export function createDesignReview(){
 const companies=[{id:'11111111-1111-4111-8111-111111111111',name:'Demo Company',slug:'demo-company',plan_code:'pro',status:'active',suspended_at:null as string|null,members:8},{id:'22222222-2222-4222-8222-222222222222',name:'Sample Studio',slug:'sample-studio',plan_code:'starter',status:'trialing',suspended_at:null as string|null,members:3}];
 const users=[{id:'33333333-3333-4333-8333-333333333333',email:'manager@example.test',full_name:'Demo Manager',session_version:0,disabled_at:null as string|null},{id:'44444444-4444-4444-8444-444444444444',email:'agent@example.test',full_name:'Demo Agent',session_version:0,disabled_at:null as string|null}];
 const plans=[{code:'starter',name:'Starter',price_cents:1900,is_active:true,limits:{agents:5,contacts:1000,messages_per_month:5000,ai_credits:100,channels:2,flows:5} as Record<string,number>,features:{reports:true,automations:false} as Record<string,boolean>},{code:'pro',name:'Pro',price_cents:4900,is_active:true,limits:{agents:20,contacts:10000,messages_per_month:50000,ai_credits:1000,channels:10,flows:50},features:{reports:true,automations:true}}];
 const prices=[{provider_id:'price_demo_pro',plan_code:'pro',amount_cents:4900,currency:'usd',interval:'month',active:true}];
 const reviews=[{id:'review-demo',company:'Demo Company',kind:'subscription_update',plan_code:'pro',reviews:[{id:'evidence-demo',status:'ready',observed_at:new Date().toISOString(),evidence:{verdict:'satisfied',providerRequestId:'req_demo_only',status:'active',cancelAtPeriodEnd:false},error:null}]}];
 const audit=[{id:'1',actor_id:users[0].id,tenant_id:companies[0].id,action:'demo.company.review',details:{sample:true},created_at:new Date().toISOString()}];
 const permissions=['companies.read','companies.write','users.read','users.write','plans.read','plans.write','subscriptions.read','subscriptions.write','reports.read','audit.read','sessions.revoke','mfa.manage'];
 return async function request(path:string,body?:unknown,method='GET'){
  const url=new URL(path||'/', 'https://design.invalid'),p=url.pathname,q=url.searchParams,b=(body||{}) as DesignBody;
  if(method==='GET'){
   if(p==='/session')return {actor:users[0].id,permissions};
   if(p==='/')return {companies,users,plans,audit};
   if(p==='/directory'){const source=q.get('kind')==='companies'?companies:users;const search=(q.get('q')||'').toLowerCase();const rows=source.filter(x=>Object.values(x).join(' ').toLowerCase().includes(search));const page=Math.max(1,Number(q.get('page')||1)),limit=50;return {items:rows.slice((page-1)*limit,page*limit),total:rows.length};}
   if(p==='/reports')return {companies:{total:companies.length,suspended:companies.filter(c=>c.suspended_at).length},subscriptions:Object.fromEntries(['active','trialing','past_due','canceled'].map(s=>[s,companies.filter(c=>c.status===s).length])),queues:{pending:0},paidInvoicesByCurrency:[{currency:'usd',invoices:2,gross_paid_minor_units:'9800'}],invoiceCohortByCurrency:[{currency:'usd',invoices:2,due_minor_units:'9800',remaining_minor_units:'0',failed_open:0}],recurringByCurrency:[{currency:'usd',status:'active',subscriptions:1,monthly_equivalent_minor_units:'4900'}],paidInvoicesMissingPaymentDate:0,unpricedLinkedSubscriptions:0};
   if(p==='/prices')return prices.slice();
   if(p==='/billing-reviews')return reviews.slice();
   if(p==='/audit'){const rows=audit.filter(x=>(!q.get('actor')||q.get('actor')===x.actor_id)&&(!q.get('tenant')||q.get('tenant')===x.tenant_id)&&(!q.get('action')||q.get('action')===x.action)&&(!q.get('from')||x.created_at>=q.get('from')!)&&(!q.get('to')||x.created_at<q.get('to')!));return {items:rows,nextCursor:null};}
  }
  const id=p.split('/')[2];const now=new Date().toISOString();
  if(method==='PATCH'&&p.startsWith('/companies/')){const c=companies.find(c=>c.id===id);if(!c)throw Error('Demo record not found');Object.assign(c,{name:b.name,suspended_at:b.suspended?now:null});}
  else if(method==='PATCH'&&p.startsWith('/subscriptions/')){const c=companies.find(c=>c.id===id);if(!c)throw Error('Demo record not found');Object.assign(c,{plan_code:b.planCode,status:b.status});}
  else if(method==='PATCH'&&p.startsWith('/users/')){const u=users.find(u=>u.id===id);if(!u)throw Error('Demo record not found');Object.assign(u,{full_name:b.name,disabled_at:b.disabled?now:null,session_version:u.session_version+1});}
  else if(p.endsWith('/revoke-sessions')){const u=users.find(u=>u.id===id);if(u)u.session_version++;}
  else if(method==='PATCH'&&p.startsWith('/plans/')){const plan=plans.find(x=>x.code===id);if(!plan)throw Error('Demo record not found');Object.assign(plan,{name:b.name,is_active:b.enabled,limits:b.limits,features:b.features});}
  else if(p==='/plans'&&method==='POST'){if(plans.some(x=>x.code===b.code))throw Error('Demo plan already exists');const template=plans.find(x=>x.code===b.templateCode)||plans[0];plans.push({...template,code:b.code,name:b.name,is_active:false,limits:{...template.limits,...b.limits}});}
  else if(p==='/prices'&&method==='POST'){prices.push({provider_id:b.priceId,plan_code:b.planCode,amount_cents:b.amountCents,currency:b.currency,interval:b.interval,active:true});}
  else if(p.endsWith('/retire')){const price=prices.find(x=>x.provider_id===id);if(price)price.active=false;}
  else if(p.endsWith('/evidence')){const row=reviews.find(x=>x.id===id);if(row)row.reviews.push({id:'demo-'+Date.now(),status:'ready',observed_at:now,evidence:{verdict:'satisfied',providerRequestId:'req_demo_only',status:'active',cancelAtPeriodEnd:false},error:null});}
  else if(p.endsWith('/confirm')){const row=reviews.find(x=>x.reviews.some(r=>r.id===id));if(row)reviews.splice(reviews.indexOf(row),1);}
  else if(p==='/mfa/backup-codes')return {codes:Array.from({length:8},(_,i)=>'DEMO-ONLY-NOT-A-REAL-CODE-'+(i+1)),displayOnce:true};
  else throw Error('Unsupported design review action');
  audit.unshift({id:String(Date.now()),actor_id:users[0].id,tenant_id:companies[0].id,action:'demo'+p.replaceAll('/','.'),details:{sample:true},created_at:now});
  return {updated:true,providerUpdated:false};
 };
}
