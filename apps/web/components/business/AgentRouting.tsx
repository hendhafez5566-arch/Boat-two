'use client';
import {useEffect,useRef,useState} from 'react';
import {api} from '../../lib/api';
import {useLocale} from '../product/locale';
import {useData} from './useData';
type Choice={id:string;name:string};
type Route={id:string;agent_name:string;channel_name:string|null;flow_name:string|null;channel_id:string|null};
export function AgentRouting({channelId}:{channelId?:string}={}){
 const {t}=useLocale();
 const routes=useData<Route[]>('/agents/routes',[]);
 const agents=useData<{agents:Choice[]}>('/agents',{agents:[]});
 const channels=useData<Choice[]>('/channels',[]),flows=useData<Choice[]>('/flows',[]);
 const [scope,setScope]=useState('channel'),[agentId,setAgentId]=useState(''),[destination,setDestination]=useState('');
 const [agentQuery,setAgentQuery]=useState(''),[destinationQuery,setDestinationQuery]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const lock=useRef(false);
 const loading=routes.loading||agents.loading||(!channelId&&(channels.loading||flows.loading));
 const loadError=routes.error||agents.error||(!channelId&&(channels.error||flows.error))||'';
 const visible=channelId?routes.data.filter(r=>r.channel_id===channelId):routes.data;
 const filter=(rows:Choice[],q:string,selected:string)=>rows.filter(r=>r.id===selected||(r.name+' '+r.id).toLowerCase().includes(q.trim().toLowerCase()));
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(timer);},[notice]);
 async function act(fn:()=>Promise<unknown>){if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');try{await fn();await routes.reload();setNotice(t('تم تحديث التوجيه','Assignment updated'));}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 return <section className="card stack" aria-busy={busy}>
  <h2>{t('توجيه المساعد حسب القناة أو السيناريو','Agent routing by channel or flow')}</h2>
  <p>{t('الأولوية لمساعد السيناريو، ثم القناة، ثم الافتراضي. المساعد المعطّل لا يستدعي مزودًا بديلًا.','Flow assignment takes precedence over channel, then default. A disabled assigned agent does not call another provider.')}</p>
  {(error||loadError)&&<p className="notice error" role="alert">{error||loadError} {loadError&&<button className="btn" disabled={busy} onClick={()=>void Promise.all([routes.reload(),agents.reload(),channels.reload(),flows.reload()])}>{t('إعادة المحاولة','Retry')}</button>}</p>}
  {notice&&<p className="notice" role="status">{notice}</p>}
  {loading&&<p role="status">{t('جارٍ التحميل…','Loading…')}</p>}
  <form className="stack" onSubmit={e=>{e.preventDefault();if(lock.current||loading||loadError||!agentId||!(channelId||destination))return;if(!window.confirm(t('تأكيد التوجيه؟ سيحل محل أي تعيين سابق لهذه الوجهة.','Confirm assignment? It replaces any existing assignment for this destination.')))return;void act(()=>api('/agents/routes',{method:'POST',body:JSON.stringify({agentId,scope:channelId?'channel':scope,scopeId:channelId||destination})}));}}>
   <fieldset disabled={busy||loading||!!loadError} className="form-grid" style={{border:0,padding:0,margin:0,minWidth:0}}>
    <label className="field">{t('بحث المساعدين','Search agents')}<input type="search" value={agentQuery} onChange={e=>setAgentQuery(e.target.value)}/></label>
    <label className="field">{t('المساعد','Agent')}<select name="agent" aria-label={t('المساعد','Agent')} required value={agentId} onChange={e=>setAgentId(e.target.value)}><option value="">{t('اختر','Choose')}</option>{filter(agents.data.agents,agentQuery,agentId).map(a=><option key={a.id} value={a.id}>{a.name} · {a.id.slice(0,8)}</option>)}</select></label>
    {!channelId&&<><label className="field">{t('نوع التوجيه','Assignment type')}<select value={scope} onChange={e=>{setScope(e.target.value);setDestination('');setDestinationQuery('');}}><option value="channel">{t('قناة','Channel')}</option><option value="flow">{t('سيناريو','Flow')}</option></select></label>
    <label className="field">{t('بحث الوجهات','Search destinations')}<input type="search" value={destinationQuery} onChange={e=>setDestinationQuery(e.target.value)}/></label>
    <label className="field">{t('الوجهة','Destination')}<select name="scopeId" required aria-label={t('الوجهة','Destination')} value={destination} onChange={e=>setDestination(e.target.value)}><option value="">{t('اختر','Choose')}</option>{filter(scope==='channel'?channels.data:flows.data,destinationQuery,destination).map(a=><option key={a.id} value={a.id}>{a.name} · {a.id.slice(0,8)}</option>)}</select></label></>}
    <button className="btn btn-primary" disabled={!agentId||!(channelId||destination)}>{t('حفظ التوجيه','Save assignment')}</button>
   </fieldset>
  </form>
  {!loading&&!loadError&&!visible.length&&<p>{t('يُستخدم المساعد الافتراضي ما لم تضف توجيهًا.','The default agent is used until an assignment is added.')}</p>}
  {!loading&&!loadError&&visible.map(r=><div className="step" key={r.id}><span>{r.flow_name||r.channel_name} → {r.agent_name}</span><button className="btn" disabled={busy} onClick={()=>{if(window.confirm(t('إزالة التوجيه الحالي؟','Remove this assignment?')))void act(()=>api('/agents/routes/'+r.id,{method:'DELETE'}));}}>{t('إزالة','Remove')}</button></div>)}
 </section>;
}
