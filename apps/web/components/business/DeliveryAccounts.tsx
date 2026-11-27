'use client';
import {DisclosureSummary} from '../product/DisclosureSummary';
import {useEffect,useRef,useState} from 'react';
import {api} from '../../lib/api';
import {useData} from './useData';
import {useLocale} from '../product/locale';
export type DeliveryAccount={id:string;name:string;provider:string;interval_ms:number;daily_limit:number;daily_used:number;usage_date:string;enabled:boolean};
type Draft={name:string;provider:string;intervalMs:number;dailyLimit:number;enabled:boolean};
const initial=(a?:DeliveryAccount):Draft=>({name:a?.name||'',provider:a?.provider||'meta',intervalMs:a?.interval_ms??1000,dailyLimit:a?.daily_limit??10000,enabled:a?.enabled??true});
function AccountForm({account,busy,onSave,onDirty}:{account?:DeliveryAccount;busy:boolean;onSave:(v:Draft,id?:string)=>Promise<boolean>;onDirty:(id:string,dirty:boolean)=>void}){
 const {t}=useLocale(),[draft,setDraft]=useState(()=>initial(account)),[saved,setSaved]=useState(()=>JSON.stringify(initial(account)));
 const dirty=JSON.stringify(draft)!==saved,id=account?.id||'new';
 const patch=(p:Partial<Draft>)=>setDraft(v=>({...v,...p}));
 useEffect(()=>{onDirty(id,dirty);return()=>onDirty(id,false);},[id,dirty,onDirty]);
 const valid=!!draft.name.trim()&&Number.isInteger(draft.intervalMs)&&draft.intervalMs>=(draft.provider==='web'?100:1000)&&draft.intervalMs<=3600000&&Number.isInteger(draft.dailyLimit)&&draft.dailyLimit>=-1&&draft.dailyLimit<=100000000&&draft.dailyLimit!==0;
 return <form className="form-grid p-3" onSubmit={async e=>{e.preventDefault();if(!valid||busy||!dirty)return;if(account&&!window.confirm(t('تعديل الحدود المشتركة قد يؤثر على كل القنوات المرتبطة. متابعة؟','Changing shared limits affects linked channels. Continue?')))return;const value={...draft,name:draft.name.trim()};if(await onSave(value,account?.id)){const next=account?value:initial();setDraft(next);setSaved(JSON.stringify(next));}}}>
 <fieldset disabled={busy} className="delivery-policy-fields">
 <label className="field">{t('اسم مجموعة حساب المزود','Provider account group name')}<input required maxLength={100} value={draft.name} onChange={e=>patch({name:e.target.value})}/></label>
 <label className="field">{t('المزود','Provider')}<select value={draft.provider} disabled={!!account||busy} onChange={e=>patch({provider:e.target.value,intervalMs:Math.max(draft.intervalMs,e.target.value==='web'?100:1000)})}><option value="meta">Meta</option><option value="web">{t('دردشة الموقع','Website')}</option></select></label>
 <label className="field">{t('الفاصل المشترك بالمللي ثانية','Shared interval in milliseconds')}<input required type="number" min={draft.provider==='web'?100:1000} max={3600000} step={1} value={Number.isNaN(draft.intervalMs)?'':draft.intervalMs} onChange={e=>patch({intervalMs:e.target.valueAsNumber})}/></label>
 <label className="field">{t('محاولات يومية UTC، ‎-1 دون حد','Daily UTC attempts, -1 unlimited')}<input required type="number" min={-1} max={100000000} step={1} value={Number.isNaN(draft.dailyLimit)?'':draft.dailyLimit} onChange={e=>patch({dailyLimit:e.target.valueAsNumber})}/></label>
 {draft.dailyLimit===0&&<p role="alert">{t('استخدم حدًا موجبًا أو -1، أو أوقف المجموعة.','Use a positive limit or -1, or disable the group.')}</p>}
 <label><input type="checkbox" checked={draft.enabled} onChange={e=>patch({enabled:e.target.checked})}/> {t('مفعّل','Enabled')}</label>
 {dirty&&<small>{t('تغييرات غير محفوظة','Unsaved changes')}</small>}
 <div className="form-actions"><button className="btn btn-primary" disabled={busy||!valid||!dirty}>{t('حفظ المجموعة','Save group')}</button><button type="button" className="btn" disabled={busy||!dirty} onClick={()=>{if(window.confirm(t('تجاهل التعديلات؟','Discard changes?')))setDraft(JSON.parse(saved));}}>{t('تراجع','Discard')}</button></div>
 </fieldset></form>;
}
export function DeliveryAccounts({changed,onDirty}:{changed:()=>void;onDirty?:(key:string,dirty:boolean)=>void}){
 const {t}=useLocale(),accounts=useData<DeliveryAccount[]>('/delivery/policies/accounts',[]);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[query,setQuery]=useState('');
 const lock=useRef(false);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(timer);},[notice]);
 async function save(draft:Draft,id?:string){if(lock.current)return false;lock.current=true;setBusy(true);setError('');setNotice('');try{await api('/delivery/policies/accounts'+(id?'/'+id:''),{method:id?'PUT':'POST',body:JSON.stringify(draft)});await accounts.reload();changed();setNotice(t('تم حفظ المجموعة','Account group saved'));return true;}catch(e){setError((e as Error).message);return false;}finally{lock.current=false;setBusy(false);}}
 return <section className="card stack" aria-busy={busy||accounts.loading}>
 <h2>{t('حدود مشتركة بين القنوات والحملات','Shared account limits across channels and campaigns')}</h2>
 <p>{t('المحاولات تُحجز ذريًا عبر العمال، والمحاولة الغامضة تظل محتسبة. هذه حدود تشغيل يحددها المسؤول وليست حصص المزود المكتشفة تلقائيًا.','Attempts reserve atomically across workers; unknown outcomes remain counted. These are operator-configured limits, not automatically discovered provider quotas.')}</p>
 {(error||accounts.error)&&<p role="alert" className="notice error">{error||accounts.error} {accounts.error&&<button className="btn" onClick={()=>void accounts.reload()}>{t('إعادة المحاولة','Retry')}</button>}</p>}
 {notice&&<p role="status" className="notice">{notice}</p>}
 <div className="form-actions"><input type="search" aria-label={t('بحث مجموعات الحساب','Search account groups')} value={query} onChange={e=>setQuery(e.target.value)}/><button className="btn" disabled={busy||accounts.loading} onClick={()=>void accounts.reload()}>{t('تحديث المجموعات','Refresh groups')}</button></div>
 <details><DisclosureSummary>{t('مجموعة جديدة','New account group')}</DisclosureSummary><AccountForm busy={busy} onSave={save} onDirty={(id,d)=>onDirty?.('account:'+id,d)}/></details>
 {accounts.loading&&<p role="status">{t('جارٍ تحميل المجموعات…','Loading groups…')}</p>}
 {!accounts.loading&&!accounts.error&&!accounts.data.length&&<p>{t('لا توجد مجموعات بعد','No groups yet')}</p>}
 {accounts.data.map(a=><details key={a.id} hidden={!(a.name+' '+a.id+' '+a.provider).toLowerCase().includes(query.trim().toLowerCase())}><DisclosureSummary>{a.name} · {a.provider} · {a.id.slice(0,8)} · {String(a.usage_date).slice(0,10)===new Date().toISOString().slice(0,10)?a.daily_used:0}/{a.daily_limit===-1?'∞':a.daily_limit} · {a.enabled?t('مفعّل','Enabled'):t('متوقف','Disabled')}</DisclosureSummary><AccountForm account={a} busy={busy} onSave={save} onDirty={(id,d)=>onDirty?.('account:'+id,d)}/></details>)}
 </section>;
}
