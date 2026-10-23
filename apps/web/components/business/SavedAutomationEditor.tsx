'use client';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useData } from './useData';
import { useLocale } from '../product/locale';
type Conditions = {
  q?: string;
  tag?: string;
  lifecycle?: string;
  ownerId?: string;
  archived?: string;
  allOf?: Conditions[];
  anyOf?: Conditions[];
};
type Action = {
  type: string;
  tag?: string;
  text?: string;
  title?: string;
  value?: string;
  delayMinutes?: number;
  url?: string;
  body?: string;
  secretId?: string;
  conditions?: Conditions;
  then?: Action[];
  otherwise?: Action[];
  actions?: Action[];
};
type Rule = {
  id: string;
  name: string;
  trigger: string;
  enabled: boolean;
  conditions: Conditions;
  actions: Action[];
};
function ConditionsForm({
  value,
  change,
}: {
  value: Conditions;
  change: (value: Conditions) => void;
}) {
  const { t } = useLocale();
  return (
    <div className="space-y-2 border rounded p-3">
      {(['q', 'tag', 'lifecycle', 'ownerId'] as const).map((key) => (
        <label className="field" key={key}>
          {
            {
              q: t('بحث', 'Search'),
              tag: t('وسم', 'Tag'),
              lifecycle: t('مرحلة العميل', 'Lifecycle'),
              ownerId: t('معرّف المسؤول', 'Owner ID'),
            }[key]
          }
          <input
            value={value[key] || ''}
            onChange={(e) => {
              const next = { ...value };
              if (e.target.value) next[key] = e.target.value;
              else delete next[key];
              change(next);
            }}
          />
        </label>
      ))}
      {(['allOf', 'anyOf'] as const).map((group) => (
        <fieldset key={group}>
          <legend>{group === 'allOf' ? 'AND' : 'OR'}</legend>
          {(value[group] || []).map((clause, index) => (
            <div key={index} className="flex gap-2">
              <select
                aria-label={t('حقل الشرط', 'Condition field')}
                value={
                  clause.tag !== undefined
                    ? 'tag'
                    : clause.lifecycle !== undefined
                      ? 'lifecycle'
                      : 'q'
                }
                onChange={(e) =>
                  change({
                    ...value,
                    [group]: (value[group] || []).map((row, i) =>
                      i === index ? { [e.target.value]: '' } : row,
                    ),
                  })
                }
              >
                <option value="tag">{t('وسم', 'Tag')}</option>
                <option value="lifecycle">{t('مرحلة', 'Lifecycle')}</option>
                <option value="q">{t('بحث', 'Search')}</option>
              </select>
              <input
                aria-label={t('قيمة الشرط', 'Condition value')}
                required
                value={clause.tag ?? clause.lifecycle ?? clause.q ?? ''}
                onChange={(e) => {
                  const key =
                    clause.tag !== undefined
                      ? 'tag'
                      : clause.lifecycle !== undefined
                        ? 'lifecycle'
                        : 'q';
                  change({
                    ...value,
                    [group]: (value[group] || []).map((row, i) =>
                      i === index ? { ...row, [key]: e.target.value } : row,
                    ),
                  });
                }}
              />
              <button
                className="btn"
                type="button"
                onClick={() =>
                  change({ ...value, [group]: (value[group] || []).filter((_, i) => i !== index) })
                }
              >
                {t('حذف', 'Remove')}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            disabled={(value[group]?.length || 0) >= 10}
            onClick={() => change({ ...value, [group]: [...(value[group] || []), { tag: '' }] })}
          >
            {t('إضافة شرط', 'Add condition')} {group === 'allOf' ? 'AND' : 'OR'}
          </button>
        </fieldset>
      ))}
    </div>
  );
}
function Steps({
  value,
  change,
  secrets,
  baseOnly = false,
}: {
  value: Action[];
  change: (value: Action[]) => void;
  secrets: { id: string; name: string }[];
  baseOnly?: boolean;
}) {
  const { t } = useLocale();
  const patch = (index: number, patch: Partial<Action>) =>
    change(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <div className="space-y-3">
      {value.map((action, index) => (
        <article key={index} className="rounded-xl border-2 border-indigo-100 p-4 space-y-3">
          <strong>
            {index + 1}. {action.type}
          </strong>
          <select
            aria-label={t('نوع الإجراء', 'Action type')}
            value={action.type}
            onChange={(e) =>
              change(
                value.map((row, i) =>
                  i === index
                    ? e.target.value === 'branch'
                      ? {
                          type: 'branch',
                          conditions: {},
                          then: [{ type: 'note', text: '' }],
                          otherwise: [],
                        }
                      : e.target.value === 'delay'
                        ? { type: 'delay', delayMinutes: 60, actions: [{ type: 'note', text: '' }] }
                        : { type: e.target.value }
                    : row,
                ),
              )
            }
          >
            {(baseOnly
              ? ['note', 'tag', 'task', 'lifecycle']
              : ['note', 'tag', 'task', 'lifecycle', 'branch', 'delay', 'http']
            ).map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
          {['note', 'tag', 'task', 'lifecycle'].includes(action.type) && (
            <label className="field">
              {t('التفاصيل', 'Details')}
              <input
                required
                value={action.text ?? action.tag ?? action.title ?? action.value ?? ''}
                onChange={(e) =>
                  patch(index, {
                    [action.type === 'note'
                      ? 'text'
                      : action.type === 'tag'
                        ? 'tag'
                        : action.type === 'task'
                          ? 'title'
                          : 'value']: e.target.value,
                  })
                }
              />
            </label>
          )}
          {['task', 'delay'].includes(action.type) && (
            <label className="field">
              {t('الدقائق', 'Minutes')}
              <input
                type="number"
                min={action.type === 'delay' ? 1 : 0}
                max={525600}
                value={action.delayMinutes ?? 0}
                onChange={(e) => patch(index, { delayMinutes: Number(e.target.value) })}
              />
            </label>
          )}
          {action.type === 'http' && (
            <>
              <label className="field">
                HTTPS URL
                <input
                  type="url"
                  required
                  value={action.url || ''}
                  onChange={(e) => patch(index, { url: e.target.value })}
                />
              </label>
              <label className="field">
                {t('المحتوى دون أسرار', 'Body without secrets')}
                <textarea
                  value={action.body || ''}
                  onChange={(e) => patch(index, { body: e.target.value })}
                />
              </label>
              <label className="field">
                {t('سر Bearer مقيّد بنطاق', 'Host-bound Bearer secret')}
                <select
                  value={action.secretId || ''}
                  onChange={(e) => {
                    const next = { ...action };
                    if (e.target.value) next.secretId = e.target.value;
                    else delete next.secretId;
                    change(value.map((row, i) => (i === index ? next : row)));
                  }}
                >
                  <option value="">{t('دون سر', 'No secret')}</option>
                  {secrets.map((secret) => (
                    <option key={secret.id} value={secret.id}>
                      {secret.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {action.type === 'branch' && (
            <>
              <ConditionsForm
                value={action.conditions || {}}
                change={(conditions) => patch(index, { conditions })}
              />
              <h4>{t('مسار نعم', 'Yes path')}</h4>
              <Steps
                value={action.then || []}
                change={(then) => patch(index, { then })}
                secrets={secrets}
                baseOnly
              />
              <h4>{t('مسار لا', 'No path')}</h4>
              <Steps
                value={action.otherwise || []}
                change={(otherwise) => patch(index, { otherwise })}
                secrets={secrets}
                baseOnly
              />
            </>
          )}
          {action.type === 'delay' && (
            <Steps
              value={action.actions || []}
              change={(actions) => patch(index, { actions })}
              secrets={secrets}
              baseOnly
            />
          )}
          <div className="flex gap-2">
            <button
              className="btn"
              type="button"
              disabled={index === 0}
              onClick={() => {
                const next = [...value];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                change(next);
              }}
            >
              {t('للأعلى', 'Move up')}
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => change(value.filter((_, i) => i !== index))}
            >
              {t('حذف الخطوة', 'Remove step')}
            </button>
          </div>
        </article>
      ))}
      <button
        className="btn"
        type="button"
        disabled={value.length >= 10}
        onClick={() => change([...value, { type: 'note', text: '' }])}
      >
        {t('إضافة خطوة', 'Add step')}
      </button>
    </div>
  );
}
export function SavedAutomationEditor() {
  const { t } = useLocale();
  const rules = useData<Rule[]>('/automations', []),
    secrets = useData<
      { id: string; name: string; enabled: boolean; version: number; allowed_hosts: string[] }[]
    >('/integrations/secrets', []),
    failures = useData<
      {
        id: string;
        name: string;
        error: string;
        attempts: number;
        event_status: string;
        resolved_at: string | null;
      }[]
    >('/automations/failures', []);
  const [rule, setRule] = useState<Rule | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      await rules.reload();
      await secrets.reload();
      await failures.reload();
      setMessage(t('تم حفظ التغيير.', 'Change saved.'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card stack">
      <h2>{t('تحرير المسارات المحفوظة والتكاملات', 'Edit saved sequences and integrations')}</h2>
      {(error || rules.error || secrets.error || failures.error) && (
        <p role="alert" className="notice error">
          {error || rules.error || secrets.error || failures.error}
        </p>
      )}
      {message && <p className="notice">{message}</p>}
      <label className="field">
        {t('افتح قاعدة محفوظة', 'Open a saved rule')}
        <select
          value={rule?.id || ''}
          onChange={(e) => setRule(rules.data.find((row) => row.id === e.target.value) || null)}
        >
          <option value="">{t('اختر قاعدة', 'Choose a rule')}</option>
          {rules.data.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </label>
      <button className="btn" onClick={() => rules.reload()}>
        {t('تحديث القائمة', 'Refresh list')}
      </button>
      {rule && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void act(() =>
              api('/automations/' + rule.id, { method: 'PATCH', body: JSON.stringify(rule) }),
            );
          }}
        >
          <label className="field">
            {t('الاسم', 'Name')}
            <input
              required
              value={rule.name}
              onChange={(e) => setRule({ ...rule, name: e.target.value })}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={(e) => setRule({ ...rule, enabled: e.target.checked })}
            />{' '}
            {t('مفعّل', 'Enabled')}
          </label>
          <ConditionsForm
            value={rule.conditions}
            change={(conditions) => setRule({ ...rule, conditions })}
          />
          <Steps
            value={rule.actions}
            change={(actions) => setRule({ ...rule, actions })}
            secrets={secrets.data.filter((secret) => secret.enabled)}
          />
          <button className="btn btn-primary" disabled={busy}>
            {t('حفظ المسار', 'Save sequence')}
          </button>
        </form>
      )}
      <details>
        <summary>{t('إدارة أسرار التكاملات', 'Manage integration secrets')}</summary>
        <form
          className="stack p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            void act(async () => {
              await api('/integrations/secrets', {
                method: 'POST',
                body: JSON.stringify({
                  name: f.get('name'),
                  value: f.get('value'),
                  allowedHosts: String(f.get('hosts'))
                    .split(',')
                    .map((host) => host.trim())
                    .filter(Boolean),
                }),
              });
              form.reset();
            });
          }}
        >
          <input name="name" placeholder={t('اسم السر', 'Secret name')} required />
          <input
            name="value"
            type="password"
            autoComplete="off"
            placeholder={t('القيمة', 'Value')}
            required
          />
          <input name="hosts" placeholder="api.example.com" required />
          <button className="btn" disabled={busy}>
            {t('حفظ مشفّر', 'Save encrypted')}
          </button>
        </form>
        {secrets.data.map((secret) => (
          <div key={secret.id} className="border rounded p-3">
            <p>
              {secret.name} · v{secret.version} · {secret.allowed_hosts.join(', ')}
            </p>
            <form
              className="form-actions"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(() =>
                  api('/integrations/secrets/' + secret.id, {
                    method: 'PATCH',
                    body: JSON.stringify({ value: f.get('value') }),
                  }),
                );
              }}
            >
              <input
                required
                type="password"
                name="value"
                autoComplete="off"
                aria-label={t('قيمة بديلة', 'Replacement secret')}
              />
              <button className="btn" disabled={busy}>
                {t('تدوير السر', 'Rotate secret')}
              </button>
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() =>
                  void act(() =>
                    api('/integrations/secrets/' + secret.id, {
                      method: 'PATCH',
                      body: JSON.stringify({ enabled: !secret.enabled }),
                    }),
                  )
                }
              >
                {secret.enabled ? t('إيقاف', 'Disable') : t('تفعيل', 'Enable')}
              </button>
            </form>
          </div>
        ))}
      </details>
      <h3>{t('الأخطاء والاستعادة', 'Failures and recovery')}</h3>
      <button className="btn" onClick={() => failures.reload()}>
        {t('تحديث الأخطاء', 'Refresh failures')}
      </button>
      {!failures.data.length && <p>{t('لا توجد أخطاء مسجلة.', 'No recorded failures.')}</p>}
      {failures.data.map((failure) => (
        <article key={failure.id} className="border rounded p-3">
          <strong>
            {failure.name} · {failure.attempts}
          </strong>
          <p>{failure.error}</p>
          <p>{failure.resolved_at ? t('تمت الاستعادة', 'Recovered') : failure.event_status}</p>
          {!failure.resolved_at && failure.event_status === 'failed' && (
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                void act(() =>
                  api('/automations/failures/' + failure.id + '/retry', { method: 'POST' }),
                )
              }
            >
              {t('إعادة محاولة آمنة', 'Retry safely')}
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
