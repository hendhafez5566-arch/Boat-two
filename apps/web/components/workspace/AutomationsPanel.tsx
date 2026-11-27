'use client';
import { AutomationTemplateAction } from '../business/AutomationTemplateAction';
import type { TemplateValue } from '../business/TemplateParameters';
import { WorkspaceHeading } from '../product/ProductUI';
import { AUTOMATION_EVENTS, eventLabel } from '../../lib/business-events';
import { statusLabel } from '../product/status';
import { SavedAutomationEditor } from '../business/SavedAutomationEditor';
import { AutomationCanvas } from '../business/AutomationCanvas';
import { useEffect,useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { useData } from '../business/useData';
type Action = {
  type: string;
  channelId?: string;
  template?: TemplateValue;
  tag?: string;
  value?: string;
  title?: string;
  delayMinutes?: number;
  text?: string;
  actions?: Action[];
};
type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  revision: number;
  trigger: string;
  conditions: { lifecycle?: string; tag?: string };
  actions: Action[];
};
export default function Automations() {
  const { t } = useLocale();
  const [ruleQuery,setRuleQuery]=useState('');const [ruleStatus,setRuleStatus]=useState('all');
  const [page,setPage]=useState(1);
  const listPath='/automations/index?'+new URLSearchParams({q:ruleQuery,status:ruleStatus,page:String(page),limit:'20'});
  const list=useData<{items:Rule[];total:number;totals:{total:number;active:number;failed:number}}>(listPath,{items:[],total:0,totals:{total:0,active:0,failed:0}});
  const ready=list.loadedPath===listPath&&!list.loading&&!list.error;
  const [runQuery,setRunQuery]=useState('');
  const [runStatus,setRunStatus]=useState('all');
  const [runPage,setRunPage]=useState(1);
  const historyPath='/automations/history/index?'+new URLSearchParams({q:runQuery,status:runStatus,page:String(runPage),limit:'25'});
  const history=useData<{items:{id:string;name:string;status:string;error:string|null;created_at:string}[];total:number}>(historyPath,{items:[],total:0});
  const historyReady=history.loadedPath===historyPath&&!history.loading&&!history.error;
  const runPages=Math.max(1,Math.ceil(history.data.total/25));
  useEffect(()=>{if(historyReady&&runPage>runPages)setRunPage(runPages);},[historyReady,runPage,runPages]);
  const [contactQuery,setContactQuery]=useState('');
  const contactPath='/crm/contacts?'+new URLSearchParams({limit:'100',q:contactQuery});
  const contacts = useData<{ items: { id: string; name: string; phone?:string }[];total?:number }>(contactPath, {
    items: [],
  });
  const [tab, setTab] = useState<'rules' | 'create' | 'saved' | 'history'>('rules');
  const [editId, setEditId] = useState('');
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('rule');
    if (id) {
      setEditId(id);
      setTab('saved');
    }
  }, []);
  const [createMode, setCreateMode] = useState<'quick' | 'sequence'>('quick');
  useEffect(() => {
    if (tab === 'rules') list.reload();
    if (tab === 'history') history.reload();
    // reload is stable per hook instance; reacting to tab changes only.
  }, [tab]);
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('crm.contacts.insert');
  const [lifecycle, setLifecycle] = useState('');
  const [tag, setTag] = useState('');
  const [actions, setActions] = useState<Action[]>([{ type: 'tag', tag: '' }]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock=useRef(false);
  const child=useRef({dirty:false,busy:false});
  const [notice,setNotice]=useState('');
  const filtered=ready?list.data.items:[];
  const pages=Math.max(1,Math.ceil(list.data.total/20));
  const dirty=tab==='create'&&createMode==='quick'&&(!!name.trim()||trigger!=='crm.contacts.insert'||!!lifecycle||!!tag||JSON.stringify(actions)!==JSON.stringify([{type:'tag',tag:''}]));
  const mayLeave=()=>!lock.current&&!child.current.busy&&(!(dirty||child.current.dirty)||window.confirm(t('توجد تغييرات غير محفوظة. هل تريد تجاهلها؟','Unsaved automation changes. Discard them?')));
  const changeTab=(next:typeof tab)=>{if(next!==tab&&mayLeave()){child.current={dirty:false,busy:false};setTab(next);}};
  const changeMode=(next:typeof createMode)=>{if(next!==createMode&&mayLeave()){child.current={dirty:false,busy:false};setCreateMode(next);}};
  useEffect(()=>{setPage(1);},[ruleQuery,ruleStatus]);
  useEffect(()=>{if(ready&&page>pages)setPage(pages);},[ready,page,pages]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(timer);},[notice]);
  useEffect(()=>{const unload=(event:BeforeUnloadEvent)=>{if(dirty||child.current.dirty||lock.current||child.current.busy){event.preventDefault();event.returnValue='';}};const click=(event:MouseEvent)=>{if(event.button!==0||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;const a=(event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement|null;if(!a||a.target==='_blank'||a.download||a.href===location.href)return;if(!mayLeave()){event.preventDefault();event.stopPropagation();}};window.addEventListener('beforeunload',unload);document.addEventListener('click',click,true);return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',click,true);};},[dirty,t]);
  async function act(fn: () => Promise<unknown>) {
    if(lock.current)return;
    lock.current=true;
    setBusy(true);setNotice('');
    setError('');
    try {
      await fn();
      await Promise.all([list.reload(),history.reload()]);
      setNotice(t('تم تنفيذ الإجراء بنجاح.','Action completed successfully.'));
    } catch (e) {
      const failure = e as Error & { details?: { code?: string } };
      const code = failure.details?.code ?? failure.message;
      setError(code === 'FEATURE_UNAVAILABLE'
        ? t(
            'هذا الإجراء غير متاح في باقة مساحة العمل الحالية. راجع الباقات لمعرفة الإمكانات المتاحة.',
            'This action is unavailable on the current workspace plan. Review plans for available features.',
          )
        : failure.message);
    } finally {
      lock.current=false;setBusy(false);
    }
  }
  const eventGroups = [
    ['contacts', t('العملاء', 'Contacts')],
    ['sales', t('المبيعات', 'Sales')],
    ['tasks', t('المتابعات', 'Follow-ups')],
    ['schedule', t('الجدولة', 'Scheduling')],
  ];
  const selectedEvent = AUTOMATION_EVENTS.find((event) => event.id === trigger);
  const actionLabel = (type: string) =>
    ({
      tag: t('وسم', 'Tag'),
      lifecycle: t('مرحلة', 'Lifecycle'),
      task: t('متابعة', 'Follow-up'),
      delay: t('انتظار', 'Wait'),
      note: t('ملاحظة', 'Note'),
      branch: t('تفرع', 'Branch'),
      http: 'Webhook',
      whatsapp_template: t('قالب واتساب', 'WhatsApp template'),
    })[type] || type;
  return (
    <section className="stack automation-professional" aria-busy={busy}>
      <WorkspaceHeading
        title={t('أتمتة الأعمال', 'Automations')}
        description={t('نفّذ إجراءً تلقائيًا عند وقوع حدث يطابق شروطك، مثل إضافة وسم لعميل جديد.', 'Run an action when an event matches your conditions, such as tagging a new contact.')}
        actions={
          <button
            type="button"
            className="btn" disabled={busy||list.loading||history.loading}
            onClick={() => {
              list.reload();
              history.reload();
            }}
          >
            {t('تحديث', 'Refresh')}
          </button>
        }
      />
      {(error || list.error||history.error) && <p className="notice error" role="alert">{error || list.error||history.error} {(list.error||history.error)&&<button className="btn" onClick={()=>void Promise.all([list.reload(),history.reload()])}>{t("إعادة المحاولة","Retry")}</button>}</p>}
      {notice&&<p className="notice" role="status">{notice}</p>}
      <div className="auto-stats">
        <div>
          <strong>{!ready?'—':list.data.totals.total}</strong>
          <span>{t('قواعد', 'Rules')}</span>
        </div>
        <div>
          <strong>{!ready?'—':list.data.totals.active}</strong>
          <span>{t('مفعّلة', 'Active')}</span>
        </div>
        <div>
          <strong>{!ready?'—':list.data.totals.failed}</strong>
          <span>{t('أخطاء غير محلولة', 'Unresolved failures')}</span>
        </div>
      </div>
      <nav
        className="auto-tabs"
        role="tablist"
        aria-label={t('أقسام الأتمتة', 'Automation sections')}
      >
        {(
          [
            ['rules', t('قواعدي', 'My rules')],
            ['create', t('إنشاء', 'Create')],
            ['saved', t('تحرير المسارات والتكاملات', 'Sequences & integrations')],
            ['history', t('سجل التنفيذ', 'Run history')],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'is-active' : ''}
            disabled={busy} onClick={() => changeTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === 'rules' && (
        <section className="stack">
          <div className="workbench-toolbar"><input type="search" value={ruleQuery} maxLength={100} onChange={e=>{setRuleQuery(e.target.value);setPage(1);}} placeholder={t('بحث عن قاعدة','Search rules')} aria-label={t('بحث القواعد','Search rules')}/><select value={ruleStatus} onChange={e=>{setRuleStatus(e.target.value);setPage(1);}} aria-label={t('حالة القاعدة','Rule status')}><option value="all">{t('الكل','All')}</option><option value="active">{t('مفعلة','Enabled')}</option><option value="inactive">{t('معطلة','Disabled')}</option></select></div>
          <div className="form-actions"><button className="btn" disabled={!ruleQuery&&ruleStatus==='all'} onClick={()=>{setRuleQuery('');setRuleStatus('all');}}>{t('مسح الفلاتر','Clear filters')}</button><small>{t('بحث في كل القواعد','Search all rules')}</small></div>
          {!ready&&!list.error&&<p role="status">{t('جارٍ التحميل…','Loading…')}</p>}
          {ready&&filtered.map((r) => (
            <article className={`auto-card ${r.enabled ? 'is-on' : ''}`} key={r.id}>
              <div className="auto-card-main">
                <div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setEditId(r.id);
                      setTab('saved');
                    }}
                  >
                    {r.name} · {t('تحرير ومراجعة', 'Edit and review')}
                  </button>
                  <p className="muted">{eventLabel(r.trigger, t)}</p>
                  <div className="auto-chips">
                    {r.actions.slice(0, 6).map((a, i) => (
                      <span key={i} className="auto-chip">
                        {actionLabel(a.type)}
                      </span>
                    ))}
                    {r.actions.length > 6 && (
                      <span className="auto-chip">+{r.actions.length - 6}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={r.enabled}
                  aria-label={
                    r.enabled
                      ? t('إيقاف القاعدة', 'Disable rule')
                      : t('تفعيل القاعدة', 'Enable rule')
                  }
                  className="auto-switch"
                  disabled={busy}
                  onClick={() => {
                    if (
                      !confirm(
                        t(
                          r.enabled?'إيقاف القاعدة؟':'هل راجعت المحفز والشروط والإجراءات؟ تفعيل القاعدة؟',
                          r.enabled?'Disable this rule?':'Have you reviewed the trigger, conditions and actions? Enable it?',
                        ),
                      )
                    )
                      return;
                    void act(() =>
                      api('/automations/' + r.id, {
                        method: 'PATCH',
                        body: JSON.stringify({
                          ...r,
                          enabled: !r.enabled,
                          expectedRevision: r.revision,
                        }),
                      }),
                    );
                  }}
                >
                  <span />
                </button>
              </div>
              {!r.enabled && (
                <p className="auto-hint">
                  {t(
                    'معطّلة: راجعها ثم فعّلها لتبدأ العمل.',
                    'Disabled: review it, then enable it to start.',
                  )}
                </p>
              )}
              {r.trigger === 'automation.scheduled' && r.enabled && (
                <form
                  className="form-grid"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const date=new Date(String(f.get('at')));const contactId=String(f.get('contactId')||'');
                    if(contacts.loading||contacts.error||contacts.loadedPath!==contactPath||!contacts.data.items.some(c=>c.id===contactId)||!Number.isFinite(date.getTime())||date.getTime()<=Date.now()){setError(t('اختر عميلًا وموعدًا مستقبليًا صالحًا.','Choose a contact and a valid future date.'));return;}
                    if(!window.confirm(t('تأكيد جدولة التنفيذ؟','Confirm scheduled execution?')))return;
                    act(() =>
                      api(`/automations/${r.id}/schedule`, {
                        method: 'POST',
                        body: JSON.stringify({
                          contactId,
                          at: date.toISOString(),
                        }),
                      }),
                    );
                  }}
                >
                  <label className="field">
                    {t('العميل', 'Contact')}
                    <input type="search" aria-label={t("بحث العملاء","Search contacts")} value={contactQuery} maxLength={100} onChange={e=>setContactQuery(e.target.value)}/>
                    {contacts.error&&<span role="alert">{contacts.error} <button type="button" className="btn" onClick={()=>void contacts.reload()}>{t("إعادة المحاولة","Retry")}</button></span>}
                    <select name="contactId" required disabled={busy||contacts.loading||!!contacts.error||contacts.loadedPath!==contactPath}>
                      <option value="">{t("اختر العميل","Choose contact")}</option>
                      {contacts.data.items.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.phone||c.id.slice(0,8)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    {t('الموعد', 'Schedule')}
                    <input name="at" type="datetime-local" required />
                  </label>
                  <button className="btn self-end" disabled={busy}>
                    {t('جدولة تنفيذ', 'Schedule execution')}
                  </button>
                </form>
              )}
            </article>
          ))}
          {ready&&list.data.total>0&&<div className="form-actions"><span>{list.data.total} · {page}/{pages}</span><button className="btn" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>{t('السابق','Previous')}</button><button className="btn" disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>{t('التالي','Next')}</button></div>}
          {ready&&list.data.totals.total>0&&!filtered.length&&<p className="empty">{t('لا توجد قواعد مطابقة','No matching rules')}</p>}
          {ready&&!list.data.totals.total && (
            <div className="card empty">
              <p>{t('لا توجد قواعد بعد.', 'No rules yet.')}</p>
              <button type="button" className="btn btn-primary" onClick={() => setTab('create')}>
                {t('أنشئ أول قاعدة', 'Create your first rule')}
              </button>
            </div>
          )}
        </section>
      )}
      {tab === 'create' && (
        <>
          <div className="auto-seg" role="group" aria-label={t('نوع القاعدة', 'Rule type')}>
            <button
              type="button"
              aria-pressed={createMode === 'quick'}
              disabled={busy} onClick={() => changeMode('quick')}
            >
              {t('قاعدة سريعة', 'Quick rule')}
              <small>{t('حدث واحد ← إجراءات بالترتيب', 'One event → ordered actions')}</small>
            </button>
            <button
              type="button"
              aria-pressed={createMode === 'sequence'}
              disabled={busy} onClick={() => changeMode('sequence')}
            >
              {t('مسار متعدد الخطوات', 'Multi-step sequence')}
              <small>
                {t('شروط AND/OR وتفرعات وانتظار', 'AND/OR conditions, branches, waits')}
              </small>
            </button>
          </div>
          {createMode === 'quick' && (
            <form
              className="card stack"
              onSubmit={(e) => {
                e.preventDefault();
                act(async () => {
                  await api('/automations', {
                    method: 'POST',
                    body: JSON.stringify({
                      name:name.trim(),
                      enabled: false,
                      trigger,
                      conditions: { ...(lifecycle ? { lifecycle } : {}), ...(tag ? { tag } : {}) },
                      actions,
                    }),
                  });
                  setName('');setTrigger('crm.contacts.insert');setLifecycle('');setTag('');setActions([{type:'tag',tag:''}]);
                  setTab('rules');
                });
              }}
            >
              <fieldset disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0,display:'grid',gap:12}}>
              <h2>{t('قاعدة جديدة', 'New automation rule')}</h2>
              <div className="form-grid">
                <label className="field">
                  {t('اسم القاعدة', 'Rule name')}
                  <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="field">
                  {t('عندما', 'When')}
                  <select
                    aria-describedby="automation-trigger-help"
                    value={trigger}
                    onChange={(e) => setTrigger(e.target.value)}
                  >
                    {!selectedEvent && (
                      <option value={trigger}>{t('حدث مخصص محفوظ', 'Saved custom event')}</option>
                    )}
                    {eventGroups.map(([group, label]) => (
                      <optgroup key={group} label={label}>
                        {AUTOMATION_EVENTS.filter((event) => event.group === group).map((event) => (
                          <option
                            key={event.id}
                            value={event.id}
                            title={t(event.descriptionAr, event.descriptionEn)}
                          >
                            {t(event.ar, event.en)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <small id="automation-trigger-help" aria-live="polite">
                    {selectedEvent
                      ? t(selectedEvent.descriptionAr, selectedEvent.descriptionEn)
                      : t(
                          'حدث محفوظ بمعرّفه الداخلي. راجع تفاصيل القاعدة قبل تغييره.',
                          'A saved event using its internal identifier. Review the rule before changing it.',
                        )}
                  </small>
                </label>
                <label className="field">
                  {t('بشرط مرحلة العميل', 'With contact lifecycle')}
                  <select value={lifecycle} onChange={(e) => setLifecycle(e.target.value)}>
                    <option value="">{t('أي مرحلة', 'Any lifecycle')}</option>
                    {['lead', 'qualified', 'customer', 'inactive'].map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s, t)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  {t('وبوجود وسم (اختياري)', 'And tag (optional)')}
                  <input value={tag} onChange={(e) => setTag(e.target.value)} />
                </label>
              </div>
              <h3 className="font-bold">{t('ثم نفّذ بالترتيب', 'Then, in order')}</h3>
              {actions.map((a, i) => (
                <div className="form-grid rounded border p-3" key={i}>
                  <label className="field">
                    {t('الإجراء', 'Action')}
                    <select
                      value={a.type}
                      onChange={(e) =>
                        setActions((xs) =>
                          xs.map((x, n) =>
                            n === i
                              ? e.target.value === 'whatsapp_template'
                                ? { type: 'whatsapp_template' }
                                : e.target.value === 'tag'
                                ? { type: 'tag', tag: '' }
                                : e.target.value === 'lifecycle'
                                  ? { type: 'lifecycle', value: 'qualified' }
                                  : e.target.value === 'task'
                                    ? { type: 'task', title: '', delayMinutes: 60 }
                                    : e.target.value === 'delay'
                                      ? {
                                          type: 'delay',
                                          delayMinutes: 60,
                                          actions: [{ type: 'task', title: '', delayMinutes: 0 }],
                                        }
                                      : { type: 'note', text: '' }
                              : x,
                          ),
                        )
                      }
                    >
                      <option value="tag">{t('إضافة وسم', 'Add tag')}</option>
                      <option value="lifecycle">{t('تحديث المرحلة', 'Update lifecycle')}</option>
                      <option value="task">{t('إنشاء متابعة', 'Create follow-up')}</option>
                      <option value="delay">
                        {t('متابعة مؤجلة من الحدث', 'Delayed follow-up from event')}
                      </option>
                      <option value="whatsapp_template">{t('إرسال قالب واتساب', 'Send WhatsApp template')}</option>
                      <option value="note">{t('تسجيل ملاحظة', 'Add note')}</option>
                    </select>
                  </label>
                  {a.type === 'whatsapp_template' ? (
                    <AutomationTemplateAction channelId={a.channelId} template={a.template}
                      change={(update) => setActions((rows) => rows.map((row, n) => n === i ? { ...row, ...update } : row))} />
                  ) : (
                  <label className="field">
                    {t('التفاصيل', 'Details')}
                    {a.type === 'lifecycle' ? (
                      <select
                        value={a.value}
                        onChange={(e) =>
                          setActions((xs) =>
                            xs.map((x, n) => (n === i ? { ...x, value: e.target.value } : x)),
                          )
                        }
                      >
                        {['lead', 'qualified', 'customer', 'inactive'].map((s) => (
                          <option key={s} value={s}>
                            {statusLabel(s, t)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        required
                        value={
                          a.type === 'delay'
                            ? a.actions?.[0]?.title || ''
                            : (a.tag ?? a.title ?? a.text ?? '')
                        }
                        onChange={(e) =>
                          setActions((xs) =>
                            xs.map((x, n) =>
                              n === i
                                ? a.type === 'delay'
                                  ? {
                                      ...x,
                                      actions: [
                                        { type: 'task', title: e.target.value, delayMinutes: 0 },
                                      ],
                                    }
                                  : {
                                      ...x,
                                      [a.type === 'tag'
                                        ? 'tag'
                                        : a.type === 'task'
                                          ? 'title'
                                          : 'text']: e.target.value,
                                    }
                                : x,
                            ),
                          )
                        }
                      />
                    )}
                  </label>
                  )}
                  {(a.type === 'task' || a.type === 'delay') && (
                    <label className="field">
                      {t('موعد المتابعة بعد (دقائق)', 'Follow-up due after (minutes)')}
                      <input
                        type="number"
                        min={0}
                        max={525600}
                        value={a.delayMinutes}
                        onChange={(e) =>
                          setActions((xs) =>
                            xs.map((x, n) =>
                              n === i ? { ...x, delayMinutes: Number(e.target.value) } : x,
                            ),
                          )
                        }
                      />
                    </label>
                  )}
                  {actions.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-danger self-end"
                      onClick={() => setActions((xs) => xs.filter((_, n) => n !== i))}
                    >
                      {t('حذف الإجراء', 'Remove action')}
                    </button>
                  )}
                </div>
              ))}
              <div className="form-actions">
                <button
                  type="button"
                  disabled={actions.length >= 10}
                  className="btn"
                  onClick={() => setActions((xs) => [...xs, { type: 'tag', tag: '' }])}
                >
                  {t('إضافة إجراء', 'Add action')}
                </button>
                <button disabled={busy} className="btn btn-primary">
                  {t('حفظ القاعدة معطلة للمراجعة', 'Save disabled rule for review')}
                </button>
              </div>
              </fieldset>
            </form>
          )}
          {createMode === 'sequence' && <AutomationCanvas onDraftState={(dirty,busy)=>{child.current={dirty,busy};}} />}
        </>
      )}
      {tab === 'saved' && <SavedAutomationEditor initialRuleId={editId} onDraftState={(dirty,busy)=>{child.current={dirty,busy};}} />}
      {tab === 'history' && (
        <section className="card table-wrap">
          <h2>{t('سجل التنفيذ', 'Execution history')}</h2>
          <div className="workbench-toolbar">
            <input type="search" maxLength={100} aria-label={t('بحث سجل التنفيذ','Search run history')} placeholder={t('ابحث باسم القاعدة أو المعرّف','Search by rule name or ID')} value={runQuery} onChange={e=>{setRunQuery(e.target.value);setRunPage(1);}}/>
            <select aria-label={t('حالة التنفيذ','Run status')} value={runStatus} onChange={e=>{setRunStatus(e.target.value);setRunPage(1);}}>
              <option value="all">{t('كل الحالات','All statuses')}</option><option value="completed">{t('مكتمل','Completed')}</option><option value="skipped">{t('تم التخطي','Skipped')}</option>
            </select>
            <button className="btn" type="button" disabled={!runQuery&&runStatus==='all'} onClick={()=>{setRunQuery('');setRunStatus('all');setRunPage(1);}}>{t('مسح فلاتر السجل','Clear history filters')}</button>
            <button type="button" className="btn" onClick={()=>{setEditId('');changeTab('saved');}}>{t('مراجعة الأخطاء','Review failures')}</button>
          </div>
          <table className="product-table">
            <thead>
              <tr>
                <th>{t('القاعدة', 'Rule')}</th>
                <th>{t('النتيجة', 'Result')}</th>
                <th>{t('الوقت', 'Time')}</th>
              </tr>
            </thead>
            <tbody>
              {historyReady&&history.data.items.map((h) => (
                <tr key={h.id}>
                  <td>{h.name}</td>
                  <td>
                    {statusLabel(h.status, t)} {h.error}
                  </td>
                  <td>{new Date(h.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.loading&&<p role="status">{t('جارٍ التحميل…','Loading…')}</p>}
          {historyReady&&history.data.total>0&&<div className="form-actions">
            <span>{t('إجمالي النتائج','Total results')}: {history.data.total} · {t('صفحة','Page')} {runPage}/{runPages}</span>
            <button type="button" className="btn" disabled={runPage<=1} onClick={()=>setRunPage(p=>p-1)}>{t('السابق','Previous')}</button>
            <button type="button" className="btn" disabled={runPage>=runPages} onClick={()=>setRunPage(p=>p+1)}>{t('التالي','Next')}</button>
          </div>}
          {historyReady&&!history.data.items.length && (
            <p className="empty">
              {t(
                'لا توجد تنفيذات مطابقة للبحث الحالي.',
                'No executions match the current search.',
              )}
            </p>
          )}
        </section>
      )}
    </section>
  );
}
