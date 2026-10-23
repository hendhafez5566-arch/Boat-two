'use client';
import { SavedAutomationEditor } from '../../../components/business/SavedAutomationEditor';
import { AutomationCanvas } from '../../../components/business/AutomationCanvas';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
import { useData } from '../../../components/business/useData';
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
  const triggers = [
    ['crm.contacts.insert', t('عند إنشاء عميل', 'Contact created')],
    ['crm.contacts.update', t('عند تحديث عميل', 'Contact updated')],
    ['crm.crm_deals.insert', t('عند إنشاء صفقة', 'Deal created')],
    ['crm.crm_deals.update', t('عند تحديث صفقة', 'Deal updated')],
    ['crm.crm_tasks.update', t('عند تحديث متابعة', 'Task updated')],
    ['automation.scheduled', t('موعد مخصص', 'Scheduled')],
  ];
  return (
    <main className="stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">BUSINESS AUTOMATION</p>
          <h1>{t('خطوات أقل، متابعة أفضل', 'Fewer steps, better follow-up')}</h1>
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
      <SavedAutomationEditor />
      <AutomationCanvas />
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
            <select value={trigger} onChange={(e) => setTrigger(e.target.value)}>
              {triggers.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('بشرط مرحلة العميل', 'With contact lifecycle')}
            <select value={lifecycle} onChange={(e) => setLifecycle(e.target.value)}>
              <option value="">{t('أي مرحلة', 'Any lifecycle')}</option>
              {['lead', 'qualified', 'customer', 'inactive'].map((s) => (
                <option key={s}>{s}</option>
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
                    <option key={s}>{s}</option>
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
                                actions: [{ type: 'task', title: e.target.value, delayMinutes: 0 }],
                              }
                            : {
                                ...x,
                                [a.type === 'tag' ? 'tag' : a.type === 'task' ? 'title' : 'text']:
                                  e.target.value,
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
      <section className="card">
        <h2>{t('قواعد الأتمتة', 'Automation rules')}</h2>
        {list.data.map((r) => (
          <div className="stack border-b py-4" key={r.id}>
            <div className="flex justify-between gap-3">
              <div>
                <strong>{r.name}</strong>
                <p className="muted">
                  {triggers.find(([id]) => id === r.trigger)?.[1] || r.trigger} · {r.actions.length}{' '}
                  {t('إجراءات', 'actions')}
                </p>
              </div>
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  act(() =>
                    api('/automations/' + r.id, {
                      method: 'PATCH',
                      body: JSON.stringify({ ...r, enabled: !r.enabled }),
                    }),
                  )
                }
              >
                {r.enabled ? t('إيقاف', 'Disable') : t('تفعيل', 'Enable')}
              </button>
            </div>
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
          </div>
        ))}
        {!list.data.length && (
          <p className="empty">
            {t('أنشئ أول قاعدة من النموذج أعلاه.', 'Build your first rule above.')}
          </p>
        )}
      </section>
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
                  {h.status} {h.error}
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
    </main>
  );
}
