'use client';
import {DeliveryAccounts,DeliveryAccount} from './DeliveryAccounts';
import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../../lib/api';
import {useData} from './useData';
import {useLocale} from '../product/locale';
type Policy={id:string;name:string;type:string;interval_ms:number;marketing_enabled:boolean;account_id:string|null};
type Draft={intervalMs:number;marketingEnabled:boolean;accountId:string|null};
const initial=(p:Policy):Draft=>({intervalMs:p.interval_ms,marketingEnabled:p.marketing_enabled,accountId:p.account_id});
function PolicyForm({policy,accounts,busy,onSave,onDirty}:{policy:Policy;accounts:DeliveryAccount[];busy:boolean;onSave:(id:string,v:Draft)=>Promise<boolean>;onDirty:(key:string,v:boolean)=>void}){
 const {t}=useLocale(),[draft,setDraft]=useState(()=>initial(policy)),[saved,setSaved]=useState(()=>JSON.stringify(initial(policy)));
 const dirty=JSON.stringify(draft)!==saved;
 const patch=(p:Partial<Draft>)=>setDraft(v=>({...v,...p}));
 const remote=JSON.stringify(initial(policy));
 useEffect(()=>{if(!dirty&&remote!==saved&&!busy){setDraft(JSON.parse(remote));setSaved(remote);}},[remote,dirty,saved,busy]);
 useEffect(()=>{onDirty('channel:'+policy.id,dirty);return()=>onDirty('channel:'+policy.id,false);},[policy.id,dirty,onDirty]);
 const choices=accounts.filter(a=>a.provider===(policy.type==='web'?'web':'meta'));
 const valid=Number.isInteger(draft.intervalMs)&&draft.intervalMs>=(policy.type==='web'||!draft.marketingEnabled?100:1000)&&draft.intervalMs<=3600000&&(!draft.accountId||choices.some(a=>a.id===draft.accountId));
 return <form className="rounded border p-3 stack" onSubmit={async e=>{e.preventDefault();if(!dirty||!valid||busy)return;if(!window.confirm(t('تأكيد تعديل سياسة إرسال القناة؟','Confirm changing channel delivery policy?')))return;if(await onSave(policy.id,draft))setSaved(JSON.stringify(draft));}}>
 <strong>{policy.name} · {policy.type} · {policy.id.slice(0,8)}</strong><fieldset disabled={busy} className="delivery-policy-fields">
 <label className="field">{t('الفاصل بالمللي ثانية','Interval in milliseconds')}<input type="number" required step={1} min={policy.type==='web'||!draft.marketingEnabled?100:1000} max={3600000} value={Number.isNaN(draft.intervalMs)?'':draft.intervalMs} onChange={e=>patch({intervalMs:e.target.valueAsNumber})}/></label>
 <label><input type="checkbox" checked={draft.marketingEnabled} onChange={e=>patch({marketingEnabled:e.target.checked})}/> {t('السماح بالحملات ضمن سياسات المزود','Allow campaigns within provider policy')}</label>
 <label className="field">{t('مجموعة الحساب المشتركة','Shared account group')}<select value={draft.accountId||''} onChange={e=>patch({accountId:e.target.value||null})}><option value="">{t('حدود القناة فقط','Channel limits only')}</option>{choices.map(a=><option key={a.id} value={a.id}>{a.name} · {a.id.slice(0,8)}{a.enabled?'':' · '+t('متوقفة','Disabled')}</option>)}</select></label>
 {draft.accountId&&choices.find(a=>a.id===draft.accountId)?.enabled===false&&<p role="status" className="notice">{t('المجموعة متوقفة وستمنع الإرسال المرتبط.','The group is disabled and will block associated sends.')}</p>}
 {dirty&&<small>{t('تغييرات غير محفوظة','Unsaved changes')}</small>}
 <div className="form-actions"><button className="btn btn-primary" disabled={busy||!dirty||!valid}>{t('حفظ','Save')}</button><button type="button" className="btn" disabled={busy||!dirty} onClick={()=>{if(window.confirm(t('تجاهل التعديلات؟','Discard changes?')))setDraft(JSON.parse(saved));}}>{t('تراجع','Discard')}</button></div>
 </fieldset></form>;
}
export function DeliveryPolicies(){
 const {t}=useLocale(),data=useData<Policy[]>('/delivery/policies',[]),accounts=useData<DeliveryAccount[]>('/delivery/policies/accounts',[]);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[query,setQuery]=useState(''),[page,setPage]=useState(1);
 const lock=useRef(false),dirty=useRef(new Set<string>());
 const onDirty=useCallback((key:string,value:boolean)=>{if(value)dirty.current.add(key);else dirty.current.delete(key);},[]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(timer);},[notice]);
 useEffect(()=>{const unload=(e:BeforeUnloadEvent)=>{if(dirty.current.size||lock.current){e.preventDefault();e.returnValue='';}};const click=(e:MouseEvent)=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;const a=(e.target as Element)?.closest?.('a[href]') as HTMLAnchorElement|null;if(!a||a.target==='_blank'||a.download||a.href===location.href)return;if(lock.current||(dirty.current.size&&!window.confirm(t('توجد سياسات غير محفوظة. تجاهلها؟','Discard unsaved delivery policies?')))){e.preventDefault();e.stopPropagation();}};window.addEventListener('beforeunload',unload);document.addEventListener('click',click,true);return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',click,true);};},[t]);
 const filtered=data.data.filter(p=>(p.name+' '+p.id+' '+p.type).toLowerCase().includes(query.trim().toLowerCase())),pages=Math.max(1,Math.ceil(filtered.length/20));
 useEffect(()=>{if(page>pages)setPage(pages);},[page,pages]);
 async function save(id:string,draft:Draft){if(lock.current)return false;lock.current=true;setBusy(true);setError('');setNotice('');try{await api('/delivery/policies/'+id,{method:'PUT',body:JSON.stringify(draft)});await data.reload();setNotice(t('تم حفظ سياسة القناة','Channel policy saved'));return true;}catch(e){setError((e as Error).message);return false;}finally{lock.current=false;setBusy(false);}}
 return <>
 <DeliveryAccounts changed={()=>void accounts.reload()} onDirty={onDirty}/>
 <section className="card stack" aria-busy={busy||data.loading}>
 <h2>{t('سياسات القنوات ومعدل الإرسال المشترك','Channel policy and shared send pacing')}</h2>
 <p>{t('فاصل الإرسال مشترك لكل الرسائل الخارجية وحملات الموقع على القناة عبر العمال؛ ردود دردشة الموقع المباشرة فورية. لا يمنح الاشتراك التسويقي إذنًا لتجاوز نافذة Meta. تفعيل السياسة لا يفعّل الإرسال الخارجي في البيئة.','Intervals pace all external messages and website campaigns across workers. Direct website chat replies remain immediate. Marketing consent does not bypass Meta response windows. Enabling policy does not enable external delivery in this environment.')}</p>
 {(error||data.error||accounts.error)&&<p role="alert" className="notice error">{error||data.error||accounts.error} {(data.error||accounts.error)&&<button className="btn" onClick={()=>void Promise.all([data.reload(),accounts.reload()])}>{t('إعادة المحاولة','Retry')}</button>}</p>}
 {notice&&<p role="status" className="notice">{notice}</p>}
 <div className="form-actions"><input type="search" aria-label={t('بحث سياسات القنوات','Search channel policies')} value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/><button className="btn" disabled={busy||data.loading||accounts.loading} onClick={()=>void Promise.all([data.reload(),accounts.reload()])}>{t('تحديث السياسات','Refresh policies')}</button><small>{t('بحث في القنوات المحملة','Search loaded channels')}</small></div>
 {data.loading&&<p role="status">{t('جارٍ تحميل السياسات…','Loading policies…')}</p>}
 {!data.loading&&!data.error&&!filtered.length&&<p>{t('لا توجد قنوات مطابقة','No matching channels')}</p>}
 {data.data.map(p=><div key={p.id} hidden={!filtered.slice((page-1)*20,page*20).some(x=>x.id===p.id)}><PolicyForm policy={p} accounts={accounts.data} busy={busy||accounts.loading||!!accounts.error} onSave={save} onDirty={onDirty}/></div>)}
 {filtered.length>0&&<div className="form-actions"><span>{filtered.length} · {page}/{pages}</span><button className="btn" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>{t('السابق','Previous')}</button><button className="btn" disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>{t('التالي','Next')}</button></div>}
 </section></>;
}
