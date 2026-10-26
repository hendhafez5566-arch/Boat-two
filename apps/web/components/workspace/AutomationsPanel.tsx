'use client';
import { AUTOMATION_EVENTS, eventLabel } from '../../lib/business-events';
import { statusLabel } from '../product/status';
import { SavedAutomationEditor } from '../business/SavedAutomationEditor';
import { AutomationCanvas } from '../business/AutomationCanvas';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { useData } from '../business/useData';
type Action = {
  type: string;
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
  trigger: string;
  conditions: { lifecycle?: string; tag?: string };
  actions: Action[];
};
export default function Automations() {
  const { t } = useLocale();
  const list = useData<Rule[]>('/automations', []);
  const history = useData<
    { id: string; name: string; status: string; error: string | null; created_at: string }[]
  >('/automations/history', []);
  const contacts = useData<{ items: { id: string; name: string }[] }>('/crm/contacts?limit=100', {
    items: [],
  });
  const [tab, setTab] = useState<'rules' | 'create' | 'saved' | 'history'>('rules');
  const [editId, setEditId] = useState('');
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
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      list.reload();
      history.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
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
    })[type] || type;
  return (
    <section className="stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('أتمتة الأعمال', 'BUSINESS AUTOMATION')}</p>
          <h1>{t('أتمتة الأعمال', 'Automations')}</h1>
          <p>
            {t(
              'الأتمتة تستخدم سجل الأحداث نفسه، وتُحفظ إجراءاتها مع نتيجة التنفيذ.',
              'Automations use the shared event ledger and commit actions with their execution result.',
            )}
          </p>
        </div>
        <button
          className="btn"
          onClick={() => {
            list.reload();
            history.reload();
          }}
        >
          {t('تحديث', 'Refresh')}
        </button>
      </div>
      {(error || list.error) && <p className="notice error">{error || list.error}</p>}
      <div className="auto-stats">
        <div>
          <strong>{list.data.length}</strong>
          <span>{t('قواعد', 'Rules')}</span>
        </div>
        <div>
          <strong>{list.data.filter((r) => r.enabled).length}</strong>
          <span>{t('مفعّلة', 'Active')}</span>
        </div>
        <div>
          <strong>{history.data.filter((h) => h.status === 'failed').length}</strong>
          <span>{t('تنفيذات فاشلة (آخر 25)', 'Failed runs (last 25)')}</span>
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
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === 'rules' && (
        <section className="stack">
          {list.data.map((r) => (
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
                      !r.enabled &&
                      !confirm(
                        t(
                          'هل راجعت المحفز والشروط والإجراءات؟ سيبدأ التنفيذ عند وقوع الحدث المطابق. تفعيل القاعدة؟',
                          'Have you reviewed the trigger, conditions and actions? This rule runs when a matching event occurs. Enable it?',
                        ),
                      )
                    )
                      return;
                    void act(() =>
                      api('/automations/' + r.id, {
                        method: 'PATCH',
                        body: JSON.stringify({ ...r, enabled: !r.enabled }),
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
                    act(() =>
                      api(`/automations/${r.id}/schedule`, {
                        method: 'POST',
                        body: JSON.stringify({
                          contactId: f.get('contactId'),
                          at: new Date(String(f.get('at'))).toISOString(),
                        }),
                      }),
                    );
                  }}
                >
                  <label className="field">
                    {t('العميل', 'Contact')}
                    <select name="contactId" required>
                      {contacts.data.items.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
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
          {!list.data.length && (
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
              onClick={() => setCreateMode('quick')}
            >
              {t('قاعدة سريعة', 'Quick rule')}
              <small>{t('حدث واحد ← إجراءات بالترتيب', 'One event → ordered actions')}</small>
            </button>
            <button
              type="button"
              aria-pressed={createMode === 'sequence'}
              onClick={() => setCreateMode('sequence')}
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
                      name,
                      enabled: false,
                      trigger,
                      conditions: { ...(lifecycle ? { lifecycle } : {}), ...(tag ? { tag } : {}) },
                      actions,
                    }),
                  });
                  setName('');
                  setTab('rules');
                });
              }}
            >
              <h2>{t('قاعدة جديدة', 'New automation rule')}</h2>
              <div className="form-grid">
                <label className="field">
                  {t('اسم القاعدة', 'Rule name')}
                  <input required value={name} onChange={(e) => setName(e.target.value)} />
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
                              ? e.target.value === 'tag'
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
                      <option value="note">{t('تسجيل ملاحظة', 'Add note')}</option>
                    </select>
                  </label>
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
            </form>
          )}
          {createMode === 'sequence' && <AutomationCanvas />}
        </>
      )}
      {tab === 'saved' && <SavedAutomationEditor initialRuleId={editId} />}
      {tab === 'history' && (
        <section className="card table-wrap">
          <h2>{t('آخر 25 تنفيذًا', 'Latest 25 executions')}</h2>
          <table className="product-table">
            <thead>
              <tr>
                <th>{t('القاعدة', 'Rule')}</th>
                <th>{t('النتيجة', 'Result')}</th>
                <th>{t('الوقت', 'Time')}</th>
              </tr>
            </thead>
            <tbody>
              {history.data.map((h) => (
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
          {!history.data.length && (
            <p className="empty">
              {t(
                'سيظهر التنفيذ عند وقوع حدث مطابق.',
                'Executions appear when a matching event occurs.',
              )}
            </p>
          )}
        </section>
      )}
    </section>
  );
}
