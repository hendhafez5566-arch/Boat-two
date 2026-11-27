'use client';
import {DeliveryPolicies} from '../../../components/business/DeliveryPolicies';
import {Dialog} from '../../../components/product/ProductUI';
import {ExternalDeliveryNotice} from '../../../components/product/ExternalDeliveryNotice';
import {statusLabel} from '../../../components/product/status';
import {useEffect,useRef,useState} from 'react';
import {api} from '../../../lib/api';
import {useLocale} from '../../../components/product/locale';
import {useData} from '../../../components/business/useData';
import styles from './delivery.module.css';
type Job={id:string;status:string;attempts:number;error:string|null;created_at:string;available_at:string;type?:string;message_id?:string;message_status?:string;conversation_id?:string;channel_name?:string;channel_type?:string};
type Index={items:Job[];total:number;counts:{status:string;count:number}[]};
export default function Delivery(){
 const {t}=useLocale();
 const [kind,setKind]=useState<'outbound'|'events'>('outbound'),[page,setPage]=useState(1),[limit,setLimit]=useState(25),[status,setStatus]=useState('all'),[query,setQuery]=useState('');
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [selected,setSelected]=useState<Job|null>(null),[result,setResult]=useState<'sent'|'failed'>('failed'),[evidence,setEvidence]=useState(''),[externalId,setExternalId]=useState('');
 const lock=useRef(false),dirty=!!selected&&!!(evidence||externalId||result==='sent');
 const path='/delivery/index?'+new URLSearchParams({kind,page:String(page),limit:String(limit),status,q:query});
 const data=useData<Index>(path,{items:[],total:0,counts:[]});
 const ready=data.loadedPath===path&&!data.loading&&!data.error;
 const pages=Math.max(1,Math.ceil(data.data.total/limit));
 const workspace=useData<{role:string}>('/workspace',{role:''});
 const canManage=['owner','admin'].includes(workspace.data.role);
 useEffect(()=>{if(ready&&page>pages)setPage(pages);},[ready,page,pages]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(timer);},[notice]);
 useEffect(()=>{if(!dirty&&!busy)return;const unload=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload);},[dirty,busy]);
 const close=()=>{if(!lock.current&&(!dirty||window.confirm(t('تجاهل دليل المراجعة غير المحفوظ؟','Discard unsaved reconciliation evidence?')))){setSelected(null);setError('');}};
 const open=(j:Job)=>{setSelected(j);setResult('failed');setEvidence('');setExternalId('');setError('');};
 async function act(path:string,body?:unknown){if(lock.current||!canManage)return;lock.current=true;setBusy(true);setError('');setNotice('');try{await api(path,{method:'POST',...(body?{body:JSON.stringify(body)}:{})});setSelected(null);await data.reload();setNotice(t('تم تسجيل الإجراء بنجاح','Action recorded successfully'));}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 const statuses=kind==='outbound'?['pending','sending','sent','failed','blocked','ambiguous']:['pending','completed','failed'];
 const count=(states:string[])=>data.data.counts.filter(x=>states.includes(x.status)).reduce((sum,x)=>sum+x.count,0);
 const format=(value:string)=>new Date(value).toLocaleString();
 const changeKind=(next:typeof kind)=>{setKind(next);setStatus('all');setQuery('');setPage(1);};
 return <main className={'stack '+styles.page} aria-busy={busy}>
 <ExternalDeliveryNotice/>
 <header className="page-heading"><div><p className="eyebrow">{t('التشغيل والتسليم','RELIABLE OPERATIONS')}</p><h1>{t('مركز التسليم والأحداث','Delivery & event center')}</h1><p>{t('الفشل المؤكد قابل للإعادة. التسليم الغامض يحتاج مراجعة المزود أولًا.','Confirmed failures can be retried. Ambiguous deliveries require provider reconciliation first.')}</p></div><button className="btn" disabled={busy||data.loading} onClick={()=>void data.reload()}>{t('تحديث','Refresh')}</button></header>
 {(error&&!selected||data.error||workspace.error)&&<p role="alert" className="notice error">{error&&!selected?error:data.error||workspace.error} {(data.error||workspace.error)&&<button className="btn" onClick={()=>void Promise.all([data.reload(),workspace.reload()])}>{t('إعادة المحاولة','Retry')}</button>}</p>}
 {notice&&<p className="notice" role="status">{notice}</p>}
 {ready&&<div className={styles.metrics}>{[{label:t('إجمالي السجلات','Total records'),value:count(statuses),tone:'primary'},{label:t('قيد الانتظار والتنفيذ','Pending and running'),value:count(['pending','sending']),tone:'info'},{label:t('نجاح التنفيذ','Completed successfully'),value:count(['sent','completed']),tone:'success'},{label:t('تحتاج إجراء','Needs attention'),value:count(['failed','blocked','ambiguous']),tone:'danger'}].map(m=><div key={m.tone} data-tone={m.tone}><small>{m.label}</small><strong>{m.value}</strong></div>)}</div>}
 <nav className="workbench-tabs" aria-label={t('سجلات التسليم','Delivery records')}>{(['outbound','events'] as const).map(key=><button key={key} type="button" disabled={busy} aria-pressed={kind===key} onClick={()=>changeKind(key)}>{key==='outbound'?t('طابور الإرسال','Outbound queue'):t('سجل الأحداث','Event ledger')}</button>)}</nav>
 <section className="card stack"><div className={styles.filters}>
 <input type="search" aria-label={t('بحث السجلات','Search records')} maxLength={200} value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} placeholder={t('المعرّف أو النوع أو الخطأ','ID, type or error')}/>
 <select aria-label={t('الحالة','Status')} value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="all">{t('كل الحالات','All statuses')}</option><option value="attention">{t('تحتاج إجراء','Needs attention')}</option>{statuses.map(v=><option key={v} value={v}>{statusLabel(v,t)}</option>)}</select>
 <button className="btn" disabled={!query&&status==='all'} onClick={()=>{setQuery('');setStatus('all');setPage(1);}}>{t('مسح الفلاتر','Clear filters')}</button></div>
 <div className={styles.tableWrap} aria-busy={data.loading}><table className="product-table"><thead><tr>{[t('الوقت','Time'),t('السجل','Record'),t('الحالة','Status'),t('المحاولات','Attempts'),t('التفاصيل','Details'),t('الإجراءات','Actions')].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
 {ready&&data.data.items.map(j=><tr key={j.id}><td>{format(j.created_at)}</td><td><strong>{j.channel_name||j.type||t('رسالة','Message')}</strong><small className={styles.id} title={j.id}>{j.id}</small></td><td><span className={styles.status} data-status={j.status}>{statusLabel(j.status,t)}</span>{j.message_status&&<small>{t('الرسالة','Message')}: {statusLabel(j.message_status,t)}</small>}</td><td>{j.attempts}</td><td>{j.error||'—'}{j.status==='pending'&&<small>{t('متاح من','Available from')}: {format(j.available_at)}</small>}</td><td><div className={styles.actions}><button className="btn" onClick={()=>open(j)}>{t('عرض التفاصيل','View details')}</button>{canManage&&(j.status==='failed'||(kind==='outbound'&&j.status==='blocked'))&&<button className="btn" disabled={busy} onClick={()=>{if(window.confirm(t('تأكيد إعادة وضع السجل في الطابور؟','Requeue this confirmed failure?')))void act('/'+(kind==='outbound'?'delivery':'events')+'/'+j.id+'/retry');}}>{t('إعادة المحاولة','Retry')}</button>}</div></td></tr>)}
 {(!ready||!data.data.items.length)&&<tr><td colSpan={6}>{data.error?t('تعذر تحميل السجلات','Unable to load records'):!ready?t('جارٍ التحميل…','Loading…'):t('لا توجد سجلات مطابقة','No matching records')}</td></tr>}
 </tbody></table></div>
 <footer className={styles.filters}><select aria-label={t('عدد الصفوف','Rows per page')} value={limit} onChange={e=>{setLimit(Number(e.target.value));setPage(1);}}>{[10,25,50,100].map(n=><option key={n}>{n}</option>)}</select><span>{ready?data.data.total+' · '+page+'/'+pages:'—'}</span><button className="btn" disabled={!ready||page<=1} onClick={()=>setPage(p=>p-1)}>{t('السابق','Previous')}</button><button className="btn" disabled={!ready||page>=pages} onClick={()=>setPage(p=>p+1)}>{t('التالي','Next')}</button></footer>
 </section>
 <Dialog open={!!selected} title={t('تفاصيل التسليم','Delivery details')} onClose={close}>{selected&&<div className="stack"><dl className={styles.details}>{[[t('المعرف','ID'),selected.id],[t('النوع','Type'),selected.channel_name||selected.type||'—'],[t('الحالة','Status'),statusLabel(selected.status,t)],[t('المحاولات','Attempts'),String(selected.attempts)],[t('معرف الرسالة','Message ID'),selected.message_id||'—'],[t('التفاصيل','Details'),selected.error||'—']].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
 {kind==='outbound'&&selected.status==='ambiguous'&&canManage&&<form className="stack" onSubmit={e=>{e.preventDefault();if(lock.current||evidence.trim().length<10||(result==='sent'&&!externalId.trim()))return;if(!window.confirm(t('تأكيد نتيجة موثقة من المزود؟ هذا الإجراء يسجل في سجل التدقيق.','Confirm the verified provider result? This action is audited.')))return;void act('/delivery/'+selected.id+'/reconcile',{result,evidence:evidence.trim(),...(result==='sent'?{externalId:externalId.trim()}:{})});}}>
 <p className="notice">{t('راجع المزود قبل تسجيل النتيجة. لا تعد المحاولة إذا كانت النتيجة غير مؤكدة.','Verify the provider first. Never retry an uncertain outcome.')}</p>
 {error&&<p role="alert" className="notice error">{error}</p>}
 <fieldset disabled={busy} className={styles.fields}><label className="field">{t('نتيجة مراجعة المزود','Provider reconciliation result')}<select value={result} onChange={e=>{setResult(e.target.value as typeof result);setExternalId('');}}><option value="failed">{t('تأكد عدم التسليم','Confirmed not sent')}</option><option value="sent">{t('تأكد الإرسال','Confirmed sent')}</option></select></label>
 {result==='sent'&&<label className="field">{t('معرّف رسالة المزود','Provider message ID')}<input required maxLength={500} value={externalId} onChange={e=>setExternalId(e.target.value)}/></label>}
 <label className="field">{t('دليل المراجعة (يُسجّل في Audit)','Reconciliation evidence (audited)')}<textarea required minLength={10} maxLength={1000} value={evidence} onChange={e=>setEvidence(e.target.value)} rows={3}/></label>
 <button className="btn btn-primary" disabled={busy||evidence.trim().length<10||(result==='sent'&&!externalId.trim())}>{t('تسجيل نتيجة المراجعة','Record reconciliation')}</button></fieldset></form>}
 </div>}</Dialog>
 {canManage&&<DeliveryPolicies/>}
 </main>;
}
