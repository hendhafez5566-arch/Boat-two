'use client';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { useData } from './useData';
type Clause = { field: 'tag' | 'lifecycle' | 'q'; value: string };
type Step = {
  type: 'note' | 'tag' | 'task' | 'lifecycle' | 'delay' | 'branch' | 'http';
  value: string;
  minutes: number;
  condition: string;
  otherwise: string;
};
export function AutomationCanvas() {
  const { t } = useLocale();
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('crm.contacts.update');
  const [mode, setMode] = useState('allOf');
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [steps, setSteps] = useState<Step[]>([
    { type: 'note', value: '', minutes: 60, condition: '', otherwise: '' },
  ]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const schedules = useData<
    { id: string; type: string; available_at: string; status: string; error: string | null }[]
  >('/automations/schedules', []);
  function patch(index: number, value: Partial<Step>) {
    setSteps((rows) => rows.map((row, i) => (i === index ? { ...row, ...value } : row)));
  }
  return (
    <section className="card stack">
      <h2>{t('محرر المسارات والتفرعات', 'Sequence and branch editor')}</h2>
      <p>
        {t(
          'أنشئ مسارًا مرتبًا بشروط AND/OR. يُحفظ معطّلًا للمراجعة قبل تفعيله من قائمة القواعد.',
          'Build an ordered sequence with AND/OR conditions. It is saved disabled for review before enabling it in the rules list.',
        )}
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="notice">{message}</p>}
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const actions = steps.map((step) =>
              step.type === 'branch'
                ? {
                    type: 'branch',
                    conditions: { tag: step.condition },
                    then: [{ type: 'note', text: step.value }],
                    otherwise: step.otherwise ? [{ type: 'note', text: step.otherwise }] : [],
                  }
                : step.type === 'http'
                  ? { type: 'http', url: step.value, body: step.otherwise }
                  : step.type === 'delay'
                    ? {
                        type: 'delay',
                        delayMinutes: step.minutes,
                        actions: [{ type: 'task', title: step.value, delayMinutes: 0 }],
                      }
                    : step.type === 'task'
                      ? { type: 'task', title: step.value, delayMinutes: step.minutes }
                      : step.type === 'tag'
                        ? { type: 'tag', tag: step.value }
                        : step.type === 'lifecycle'
                          ? { type: 'lifecycle', value: step.value }
                          : { type: 'note', text: step.value },
            );
            await api('/automations', {
              method: 'POST',
              body: JSON.stringify({
                name,
                trigger,
                conditions: { [mode]: clauses.map((clause) => ({ [clause.field]: clause.value })) },
                actions,
                enabled: false,
              }),
            });
            setMessage(
              t(
                'حُفظ المسار. حدّث قائمة القواعد لمراجعته وتفعيله.',
                'Sequence saved. Refresh the rules list to review and enable it.',
              ),
            );
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <label className="field">
            {t('الاسم', 'Name')}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </label>
          <label className="field">
            {t('الحدث', 'Trigger')}
            <select value={trigger} onChange={(e) => setTrigger(e.target.value)}>
              {[
                'crm.contacts.insert',
                'crm.contacts.update',
                'crm.crm_deals.insert',
                'crm.crm_deals.update',
                'crm.crm_tasks.insert',
                'crm.crm_tasks.update',
                'automation.scheduled',
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="rounded-xl border p-4 space-y-3">
          <label className="field">
            {t('الشروط', 'Conditions')}
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="allOf">{t('كل الشروط AND', 'All conditions AND')}</option>
              <option value="anyOf">{t('أي شرط OR', 'Any condition OR')}</option>
            </select>
          </label>
          {clauses.map((clause, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <select
                aria-label={t('حقل الشرط', 'Condition field')}
                value={clause.field}
                onChange={(e) =>
                  setClauses((rows) =>
                    rows.map((row, n) =>
                      n === i ? { ...row, field: e.target.value as Clause['field'] } : row,
                    ),
                  )
                }
              >
                <option value="tag">{t('وسم', 'Tag')}</option>
                <option value="lifecycle">{t('مرحلة العميل', 'Lifecycle')}</option>
                <option value="q">{t('بحث في الملف', 'Profile search')}</option>
              </select>
              <input
                required
                maxLength={50}
                aria-label={t('قيمة الشرط', 'Condition value')}
                value={clause.value}
                onChange={(e) =>
                  setClauses((rows) =>
                    rows.map((row, n) => (n === i ? { ...row, value: e.target.value } : row)),
                  )
                }
              />
              <button
                type="button"
                className="btn"
                onClick={() => setClauses((rows) => rows.filter((_, n) => n !== i))}
              >
                {t('حذف', 'Remove')}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            disabled={clauses.length >= 10}
            onClick={() => setClauses((rows) => [...rows, { field: 'tag', value: '' }])}
          >
            {t('إضافة شرط', 'Add condition')}
          </button>
        </div>
        {steps.map((step, index) => (
          <div key={index} className="rounded-xl border-2 border-indigo-100 p-4 space-y-3">
            <h3>
              {t('الخطوة', 'Step')} {index + 1} ↓
            </h3>
            <select
              aria-label={t('نوع الخطوة', 'Step type')}
              value={step.type}
              onChange={(e) =>
                patch(index, { type: e.target.value as Step['type'], value: '', otherwise: '' })
              }
            >
              {[
                ['note', t('ملاحظة', 'Note')],
                ['tag', t('وسم', 'Tag')],
                ['lifecycle', t('مرحلة العميل', 'Lifecycle')],
                ['task', t('مهمة', 'Task')],
                ['delay', t('انتظار ثم متابعة', 'Wait then follow-up')],
                ['branch', t('تفرع حسب وسم', 'Branch by tag')],
                ['http', t('Webhook HTTPS', 'HTTPS webhook')],
              ].map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            {step.type === 'branch' && (
              <label className="field">
                {t('إذا كان العميل يحمل الوسم', 'If contact has tag')}
                <input
                  value={step.condition}
                  onChange={(e) => patch(index, { condition: e.target.value })}
                  required
                  maxLength={50}
                />
              </label>
            )}
            <label className="field">
              {step.type === 'http'
                ? 'HTTPS URL'
                : step.type === 'branch'
                  ? t('مسار نعم: ملاحظة', 'Yes path: note')
                  : t('القيمة أو التفاصيل', 'Value or details')}
              {step.type === 'lifecycle' ? (
                <select
                  required
                  value={step.value}
                  onChange={(e) => patch(index, { value: e.target.value })}
                >
                  <option value="">{t('اختر', 'Choose')}</option>
                  {['lead', 'qualified', 'customer', 'inactive'].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              ) : (
                <input
                  required
                  type={step.type === 'http' ? 'url' : 'text'}
                  value={step.value}
                  onChange={(e) => patch(index, { value: e.target.value })}
                  maxLength={step.type === 'tag' ? 50 : 2000}
                />
              )}
            </label>
            {['task', 'delay'].includes(step.type) && (
              <label className="field">
                {t('الدقائق', 'Minutes')}
                <input
                  type="number"
                  min={step.type === 'delay' ? 1 : 0}
                  max={525600}
                  value={step.minutes}
                  onChange={(e) => patch(index, { minutes: Number(e.target.value) })}
                />
              </label>
            )}
            {['branch', 'http'].includes(step.type) && (
              <label className="field">
                {step.type === 'branch'
                  ? t('مسار لا: ملاحظة اختيارية', 'No path: optional note')
                  : t('جسم الطلب دون أسرار (JSON)', 'Request body without secrets (JSON)')}
                <textarea
                  value={step.otherwise}
                  onChange={(e) => patch(index, { otherwise: e.target.value })}
                  maxLength={16000}
                />
              </label>
            )}
            {step.type === 'http' && (
              <p className="notice">
                {t(
                  'الإرسال الخارجي معطّل. لا تضع مفاتيح في الرابط أو المحتوى. يمنع المحرك العناوين الداخلية والتحويلات ويخزّن نتيجة التأثير قبل إعادة المحاولة.',
                  'External delivery is disabled. Do not put keys in the URL or body. The engine blocks private addresses and redirects and caches external outcomes before retries.',
                )}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className="btn"
                disabled={index === 0}
                onClick={() =>
                  setSteps((rows) => {
                    const next = [...rows];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    return next;
                  })
                }
              >
                {t('للأعلى', 'Move up')}
              </button>
              <button
                type="button"
                className="btn"
                disabled={steps.length === 1}
                onClick={() => setSteps((rows) => rows.filter((_, i) => i !== index))}
              >
                {t('حذف', 'Remove')}
              </button>
            </div>
          </div>
        ))}
        <div className="form-actions">
          <button
            type="button"
            className="btn"
            disabled={steps.length >= 10}
            onClick={() =>
              setSteps((rows) => [
                ...rows,
                { type: 'note', value: '', minutes: 60, condition: '', otherwise: '' },
              ])
            }
          >
            {t('إضافة خطوة', 'Add step')}
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {t('حفظ المسار معطّلًا', 'Save disabled sequence')}
          </button>
        </div>
      </form>
      <h3>{t('المواعيد والمتابعات', 'Scheduled work and follow-ups')}</h3>
      <button className="btn" onClick={() => schedules.reload()}>
        {t('تحديث المواعيد', 'Refresh schedules')}
      </button>
      {schedules.error && <p className="notice error">{schedules.error}</p>}
      {schedules.data.map((item) => (
        <div className="rounded border p-3" key={item.id}>
          <p>
            {item.type} · {item.status} · {new Date(item.available_at).toLocaleString()}
          </p>
          {item.error && <p>{item.error}</p>}
          {item.status === 'pending' && (
            <form
              className="form-actions"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try {
                  await api('/automations/schedules/' + item.id, {
                    method: 'PATCH',
                    body: JSON.stringify({ at: new Date(String(f.get('at'))).toISOString() }),
                  });
                  await schedules.reload();
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              <input
                name="at"
                type="datetime-local"
                required
                aria-label={t('الموعد الجديد', 'New schedule')}
              />
              <button className="btn">{t('إعادة الجدولة', 'Reschedule')}</button>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  try {
                    await api('/automations/schedules/' + item.id, {
                      method: 'PATCH',
                      body: JSON.stringify({ cancel: true }),
                    });
                    await schedules.reload();
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                {t('إلغاء', 'Cancel')}
              </button>
            </form>
          )}
        </div>
      ))}
    </section>
  );
}
