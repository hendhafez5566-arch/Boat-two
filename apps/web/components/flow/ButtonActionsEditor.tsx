'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';

export type ButtonAction =
  | {type:'integration';connectionId:string;payload:string}
  | { type: 'set_field'; key: string; value: string }
  | { type: 'tag'; add: string[]; remove: string[] }
  | { type: 'list'; listId: string; operation: 'add' | 'remove' }
  | { type: 'sequence'; sequenceId: string; operation: 'subscribe' | 'unsubscribe' }
  | { type: 'assign'; userId?: string; departmentId?: string }
  | { type: 'webhook'; url: string; body: string };

function TagInput({values,onCommit}:{values:string[];onCommit:(values:string[])=>void}) {
  const [draft,setDraft]=useState(values.join(','));
  useEffect(()=>setDraft(values.join(',')),[values]);
  return <input value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>onCommit(draft.split(/[,،]/).map(s=>s.trim()).filter(Boolean))}/>;
}

export default function ButtonActionsEditor({ value = [], onChange }: { value?: ButtonAction[]; onChange: (v: ButtonAction[]) => void }) {
  const { t } = useLocale();
  const [lists, setLists] = useState<{id:string;name:string}[]>([]);
  const [sequences, setSequences] = useState<{id:string;name:string;status:string}[]>([]);
  const [departments, setDepartments] = useState<{id:string;name:string;members:string[]}[]>([]);
  const [staff, setStaff] = useState<{user_id:string;full_name:string;email:string}[]>([]);
  const [failed, setFailed] = useState(false);
  const [connections,setConnections]=useState<{id:string;provider:string;name:string;enabled:boolean}[]>([]);
  useEffect(()=>{api<typeof connections>('/integrations').then(setConnections).catch(()=>{});},[]);
  useEffect(() => {
    let active = true;
    Promise.allSettled([api<typeof lists>('/contact-lists'), api<typeof sequences>('/sequences'), api<typeof departments>('/departments'), api<{members:typeof staff}>('/team')]).then(results => {
      if (!active) return;
      const [a,b,c,d] = results;
      if (a.status === 'fulfilled') setLists(a.value);
      if (b.status === 'fulfilled') setSequences(b.value);
      if (c.status === 'fulfilled') setDepartments(c.value);
      if (d.status === 'fulfilled') setStaff(d.value.members ?? []);
      setFailed(results.some(r => r.status === 'rejected'));
    });
    return () => { active = false; };
  }, []);
  const labels = { integration:t('Google Sheets / Calendar / مزود خارجي','Google Sheets / Calendar / provider'), set_field:t('حفظ حقل مخصص','Save custom field'), tag:t('إضافة / إزالة وسوم','Add / remove labels'), list:t('إضافة / إزالة من قائمة','Add / remove list membership'), sequence:t('اشتراك / إلغاء تسلسل','Subscribe / unsubscribe sequence'), assign:t('تحويل لموظف أو قسم','Assign employee or department'), webhook:t('إرسال Webhook','Send webhook') };
  const patch = (i:number, action:ButtonAction) => onChange(value.map((a,j) => j === i ? action : a));
  const pick = (current:string|undefined, rows:{id:string;name:string}[], onPick:(id:string)=>void) => <select value={current ?? ''} onChange={e=>onPick(e.target.value)}><option value="">{t('اختر…','Choose…')}</option>{current && !rows.some(r=>r.id===current) && <option value={current}>{t('اختيار محفوظ غير متاح','Saved selection unavailable')}</option>}{rows.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select>;
  return <section className="smart-section"><h3>{t('أفعال الضغط بالترتيب','Press actions in order')}</h3>
    <p>{t('تُنفذ الأفعال قبل الانتقال للخطوة المتصلة. التحويل يوقف البوت. المحاكي يعرض أفعالًا وهمية بوضوح.','Actions run before the linked step. Assignment stops the bot. The simulator clearly reports mocked actions.')}</p>
    {failed && <p role="status">{t('تعذر تحميل بعض قوائم الاختيار. القيم المحفوظة لم تتغير؛ راجع الصلاحيات أو أعد فتح المحرر.','Some selections could not load. Saved values are unchanged; check permissions or reopen the editor.')}</p>}
    {value.map((a,i)=><fieldset className="smart-section" key={i}><legend>{i+1}. {labels[a.type]}</legend>
      {a.type==='integration'&&<><label>{t('ملف ربط مأذون','Authorized connection')}{pick(a.connectionId,connections.filter(c=>c.enabled&&c.provider!=='webhook').map(c=>({id:c.id,name:c.name+' · '+c.provider})),id=>patch(i,{...a,connectionId:id}))}</label><label>{t('بيانات العملية JSON — تدعم المتغيرات','Operation JSON — supports variables')}<textarea dir="ltr" rows={7} value={a.payload} onChange={e=>patch(i,{...a,payload:e.target.value})}/></label><p>{t('Calendar: calendar_event مع calendarId/summary/start/end. Sheets: sheet_append مع spreadsheetId/range/values. مزود القوائم يستخدم موافقة العميل الحالي.','Calendar: calendar_event with calendarId/summary/start/end. Sheets: sheet_append with spreadsheetId/range/values. Mailing providers use the current contact consent.')}</p><a href="/dashboard/integrations" target="_blank" rel="noopener noreferrer">{t('إدارة التفويض والمعاينة','Manage authorization and preview')}</a></>}
      {a.type === 'set_field' && <><label>{t('اسم الحقل','Field key')}<input dir="ltr" value={a.key} pattern="[A-Za-z_][A-Za-z0-9_]{0,40}" maxLength={41} onChange={e=>patch(i,{...a,key:e.target.value})}/></label><label>{t('القيمة (تدعم المتغيرات)','Value (supports variables)')}<input value={a.value} maxLength={2000} onChange={e=>patch(i,{...a,value:e.target.value})}/></label></>}
      {a.type === 'tag' && <><label>{t('إضافة وسوم — افصل بفاصلة','Add labels — comma separated')}<TagInput values={a.add} onCommit={add=>patch(i,{...a,add})}/></label><label>{t('إزالة وسوم','Remove labels')}<TagInput values={a.remove} onCommit={remove=>patch(i,{...a,remove})}/></label></>}
      {a.type === 'list' && <><label>{t('القائمة','List')}{pick(a.listId,lists,id=>patch(i,{...a,listId:id}))}</label><label>{t('العملية','Operation')}<select value={a.operation} onChange={e=>patch(i,{...a,operation:e.target.value as 'add'|'remove'})}><option value="add">{t('إضافة','Add')}</option><option value="remove">{t('إزالة','Remove')}</option></select></label><a href="/dashboard/crm/lists" target="_blank" rel="noopener noreferrer">{t('إدارة القوائم','Manage lists')}</a></>}
      {a.type === 'sequence' && <><label>{t('التسلسل','Sequence')}{pick(a.sequenceId,sequences.filter(s=>a.operation==='unsubscribe'||s.status==='active'),id=>patch(i,{...a,sequenceId:id}))}</label><label>{t('العملية','Operation')}<select value={a.operation} onChange={e=>patch(i,{...a,operation:e.target.value as 'subscribe'|'unsubscribe'})}><option value="subscribe">{t('اشتراك','Subscribe')}</option><option value="unsubscribe">{t('إلغاء الاشتراك','Unsubscribe')}</option></select></label></>}
      {a.type === 'assign' && <><label>{t('القسم (اختياري)','Department (optional)')}{pick(a.departmentId,departments,id=>patch(i,{...a,departmentId:id||undefined,userId:undefined}))}</label><label>{t('الموظف (اختياري)','Employee (optional)')}{pick(a.userId,staff.filter(s=>!a.departmentId||departments.find(d=>d.id===a.departmentId)?.members.includes(s.user_id)).map(s=>({id:s.user_id,name:s.full_name||s.email})),id=>patch(i,{...a,userId:id||undefined}))}</label></>}
      {a.type === 'webhook' && <><label>{t('رابط HTTPS — يتطلب إذن مالك البيانات','HTTPS URL — requires data owner authorization')}<input dir="ltr" type="url" value={a.url} onChange={e=>patch(i,{...a,url:e.target.value})}/></label><label>{t('محتوى الطلب (متغيرات اختيارية)','Request body (optional variables)')}<textarea dir="ltr" rows={4} value={a.body} maxLength={10000} onChange={e=>patch(i,{...a,body:e.target.value})}/></label></>}
      <div className="form-actions"><button type="button" disabled={i===0} onClick={()=>{const next=[...value];[next[i-1],next[i]]=[next[i],next[i-1]];onChange(next);}}>{t('لأعلى','Move up')}</button><button type="button" disabled={i===value.length-1} onClick={()=>{const next=[...value];[next[i+1],next[i]]=[next[i],next[i+1]];onChange(next);}}>{t('لأسفل','Move down')}</button><button type="button" onClick={()=>onChange(value.filter((_,j)=>j!==i))}>{t('إزالة الفعل','Remove action')}</button></div>
    </fieldset>)}
    <label>{t('إضافة فعل','Add action')}<select value="" disabled={value.length>=20} onChange={e=>{
      const type=e.target.value as ButtonAction['type'];
      const defaults:Record<ButtonAction['type'],ButtonAction>={integration:{type:'integration',connectionId:'',payload:JSON.stringify({operation:'calendar_event',calendarId:'primary',summary:'Appointment',start:'',end:'',timezone:'Africa/Cairo'},null,2)},set_field:{type:'set_field',key:'',value:''},tag:{type:'tag',add:[],remove:[]},list:{type:'list',listId:lists[0]?.id??'',operation:'add'},sequence:{type:'sequence',sequenceId:sequences.find(s=>s.status==='active')?.id??'',operation:'subscribe'},assign:{type:'assign'},webhook:{type:'webhook',url:'https://',body:'{}'}};
      if(type)onChange([...value,defaults[type]]);
    }}><option value="">{t('اختر نوع الفعل','Choose action type')}</option>{Object.entries(labels).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
  </section>;
}
