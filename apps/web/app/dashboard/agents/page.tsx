'use client';
import { ModelCatalog } from '../../../components/business/ModelCatalog';
import { ProviderEditor } from '../../../components/business/ProviderEditor';
import { AiToolAudit } from '../../../components/business/AiToolAudit';
import { AgentRouting } from '../../../components/business/AgentRouting';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
import { useData } from '../../../components/business/useData';
type Agent = {
  id: string;
  name: string;
  instructions: string;
  provider_id: string | null;
  source_ids: string[];
  enabled: boolean;
  is_default: boolean;
  allowed_tools: string[];
};
type Provider = {
  id: string;
  name: string;
  kind: string;
  model: string;
  enabled: boolean;
  revision: number;
  retired_at: string | null;
  supports_tools: boolean;
  context_token_limit: number;
  max_output_tokens: number;
  input_microusd_per_million: string | null;
  output_microusd_per_million: string | null;
};
type Run = {
  id: string;
  input_tokens: number;
  output_tokens: number;
  cost_microusd: number | null;
  input_rate_microusd: string | null;
  output_rate_microusd: string | null;
  model: string;
  status: string;
  error: string | null;
  created_at: string;
};
export default function Agents() {
  const { t } = useLocale();
  const data = useData<{ agents: Agent[]; providers: Provider[]; runs: Run[] }>('/agents', {
    agents: [],
    providers: [],
    runs: [],
  });
  const sources = useData<{ id: string; title: string; status: string }[]>('/ai/knowledge', []);
  const [form, setForm] = useState({
    id: '',
    name: '',
    instructions: '',
    providerId: '',
    sourceIds: [] as string[],
    allowedTools: ['handoff_to_human'] as string[],
    enabled: false,
    isDefault: false,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function act(path: string, body: unknown, method = 'POST') {
    setBusy(true);
    setError('');
    try {
      await api(path, { method, body: JSON.stringify(body) });
      data.reload();
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">AI AGENTS</p>
          <h1>{t('مساعد يعرف شركتك', 'An assistant that knows your business')}</h1>
          <p>
            {t(
              'مساعد افتراضي لكل شركة، مصادر معرفة محددة، ومراقبة استهلاك فعلية.',
              'A default workspace agent, scoped knowledge sources and actual usage tracking.',
            )}
          </p>
        </div>
      </div>
      <p className="notice">
        {t(
          'استدعاءات المزود المدفوعة معطلة افتراضيًا. لا تضع مفاتيح إنتاجية قبل التصريح. التكلفة تعرض فقط إن وُجدت بيانات تسعير موثقة.',
          'Paid provider calls are disabled by default. Do not enter production keys without authorization. Cost is shown only when verified pricing is available.',
        )}
      </p>
      {(error || data.error) && <p className="notice error">{error || data.error}</p>}
      <div className="card-grid">
        {data.data.agents.map((a) => (
          <section className="card" key={a.id}>
            <h2>{a.name}</h2>
            <span className="badge">
              {a.enabled ? t('مفعّل', 'Enabled') : t('معطّل', 'Disabled')}
              {a.is_default ? ' · ' + t('افتراضي', 'Default') : ''}
            </span>
            <p className="muted mt-3">{a.instructions}</p>
            <button
              className="btn mt-3"
              onClick={() =>
                setForm({
                  id: a.id,
                  name: a.name,
                  instructions: a.instructions,
                  providerId: a.provider_id || '',
                  sourceIds: a.source_ids,
                  allowedTools: a.allowed_tools,
                  enabled: a.enabled,
                  isDefault: a.is_default,
                })
              }
            >
              {t('إدارة المساعد', 'Manage agent')}
            </button>
          </section>
        ))}
      </div>
      <form
        className="card stack"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await act(
              '/agents' + (form.id ? '/' + form.id : ''),
              {
                name: form.name,
                instructions: form.instructions,
                providerId: form.providerId || null,
                sourceIds: form.sourceIds,
                allowedTools: form.allowedTools,
                enabled: form.enabled,
                isDefault: form.isDefault,
              },
              form.id ? 'PATCH' : 'POST',
            );
            setForm({
              id: '',
              name: '',
              instructions: '',
              providerId: '',
              sourceIds: [],
              allowedTools: ['handoff_to_human'],
              enabled: false,
              isDefault: false,
            });
          } catch {
            /* The action helper displays the error. */
          }
        }}
      >
        <h2>{form.id ? t('تعديل المساعد', 'Edit agent') : t('مساعد جديد', 'New agent')}</h2>
        <div className="form-grid">
          <label className="field">
            {t('الاسم', 'Name')}
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="field">
            {t('مزود الخدمة', 'Provider')}
            <select
              value={form.providerId}
              onChange={(e) => setForm({ ...form, providerId: e.target.value })}
            >
              <option value="">
                {t('إعدادات البيئة عند توفرها', 'Environment provider if configured')}
              </option>
              {data.data.providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!!p.retired_at}>
                  {p.name} · {p.model}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          {t('تعليمات المساعد', 'Agent instructions')}
          <textarea
            rows={5}
            maxLength={4000}
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          />
        </label>
        <fieldset>
          <legend className="font-bold mb-2">
            {t('مصادر المعرفة المسموحة', 'Allowed knowledge sources')}
          </legend>
          {sources.data.map((s) => (
            <label className="flex gap-2 py-1" key={s.id}>
              <input
                type="checkbox"
                checked={form.sourceIds.includes(s.id)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    sourceIds: e.target.checked
                      ? [...form.sourceIds, s.id]
                      : form.sourceIds.filter((x) => x !== s.id),
                  })
                }
              />
              {s.title} · {s.status}
            </label>
          ))}
          <p className="muted">
            {t(
              'المساعد ذو قائمة مصادر فارغة لا يسترجع وثائق؛ أضف المصادر من قاعدة المعرفة.',
              'An agent with no sources retrieves no documents; add sources from Knowledge.',
            )}
          </p>
        </fieldset>
        <fieldset>
          <legend className="font-bold">
            {t(
              'أدوات مسموحة للمساعد في العميل الحالي فقط',
              'Tools allowed for the current contact only',
            )}
          </legend>
          {[
            ['handoff_to_human', t('تحويل لموظف', 'Human escalation')],
            ['create_followup', t('إنشاء متابعة', 'Create follow-up')],
            ['tag_contact', t('تصنيف العميل بوسم', 'Tag contact')],
          ].map(([id, label]) => (
            <label className="flex gap-2 py-1" key={id}>
              <input
                type="checkbox"
                checked={form.allowedTools.includes(id)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    allowedTools: e.target.checked
                      ? [...form.allowedTools, id]
                      : form.allowedTools.filter((x) => x !== id),
                  })
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          {t('تفعيل المساعد', 'Enable agent')}
        </label>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={form.isDefault}
            onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
          />
          {t('استخدامه كمساعد افتراضي في المحادثات', 'Use as default agent for conversations')}
        </label>
        <button className="btn btn-primary self-start" disabled={busy}>
          {t('حفظ المساعد', 'Save agent')}
        </button>
      </form>
      <section className="card">
        <h2>{t('مزودو الخدمة', 'Providers')}</h2>
        {data.data.providers.map((p) => (
          <ProviderEditor key={p.id + ':' + p.revision} provider={p} busy={busy} act={act} />
        ))}
      </section>
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          try {
            await act('/agents/providers', {
              name: f.get('name'),
              kind: f.get('kind'),
              model: f.get('model'),
              apiKey: f.get('apiKey'),
              enabled: false,
              inputUsdPerMillion: f.get('inputPrice') === '' ? null : Number(f.get('inputPrice')),
              outputUsdPerMillion:
                f.get('outputPrice') === '' ? null : Number(f.get('outputPrice')),
            });
            form.reset();
          } catch {
            /* The action helper displays the error. */
          }
        }}
      >
        <h2>
          {t('إضافة مزود (يحفظ معطلًا ومشفرًا)', 'Add provider (saved disabled and encrypted)')}
        </h2>
        <label className="field">
          {t('المزود', 'Provider')}
          <select name="kind">
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
          </select>
        </label>
        <div className="form-grid">
          <label className="field">
            {t('الاسم', 'Name')}
            <input name="name" required />
          </label>
          <label className="field">
            {t('معرّف النموذج', 'Model identifier')}
            <input required name="model" dir="ltr" />
          </label>
          <label className="field">
            {t('مفتاح API', 'API key')}
            <input required name="apiKey" type="password" minLength={10} autoComplete="off" />
          </label>
        </div>
        <div className="form-grid mt-4">
          <label className="field">
            {t('سعر مليون رمز إدخال بالدولار (اختياري)', 'USD per million input tokens (optional)')}
            <input type="number" name="inputPrice" min={0} max={10000} step="0.000001" />
          </label>
          <label className="field">
            {t(
              'سعر مليون رمز إخراج بالدولار (اختياري)',
              'USD per million output tokens (optional)',
            )}
            <input type="number" name="outputPrice" min={0} max={10000} step="0.000001" />
          </label>
        </div>
        <p className="muted">
          {t(
            'التكلفة تقدير باستخدام الأسعار التي تسجلها، وليست فاتورة المزود.',
            'Costs are estimates from your configured rates, not provider invoices.',
          )}
        </p>
        <button className="btn mt-4" disabled={busy}>
          {t('حفظ المزود', 'Save provider')}
        </button>
      </form>
      <ModelCatalog key={data.data.providers.map((p) => p.id + ':' + p.revision).join(',')} />
      <AgentRouting />
      <section className="card table-wrap">
        <h2>{t('آخر 100 استدعاء', 'Latest 100 calls')}</h2>
        <table className="product-table">
          <thead>
            <tr>
              <th>{t('النموذج', 'Model')}</th>
              <th>{t('رموز الإدخال', 'Input tokens')}</th>
              <th>{t('رموز الإخراج', 'Output tokens')}</th>
              <th>{t('التكلفة', 'Cost')}</th>
              <th>
                {t(
                  'أسعار الإدخال / الإخراج المحفوظة لكل مليون رمز',
                  'Saved input / output rates per million tokens',
                )}
              </th>
              <th>{t('الحالة', 'Status')}</th>
            </tr>
          </thead>
          <tbody>
            {data.data.runs.map((r) => (
              <tr key={r.id}>
                <td>{r.model}</td>
                <td>{r.input_tokens}</td>
                <td>{r.output_tokens}</td>
                <td>
                  {r.cost_microusd === null
                    ? t('غير محسوبة', 'Not calculated')
                    : '$' + r.cost_microusd / 1000000}
                </td>
                <td>
                  {r.input_rate_microusd === null
                    ? '—'
                    : '$' + Number(r.input_rate_microusd) / 1000000}{' '}
                  /{' '}
                  {r.output_rate_microusd === null
                    ? '—'
                    : '$' + Number(r.output_rate_microusd) / 1000000}
                </td>
                <td>
                  {r.status}
                  {r.error && (
                    <small className="block">
                      {r.error === 'provider_error'
                        ? t(
                            'فشل المزود؛ راجع الإعدادات والتحويل البشري. لا يُعاد الاستدعاء تلقائيًا.',
                            'Provider failed; review configuration and human handoff. The call is not automatically repeated.',
                          )
                        : t(
                            'تعذّر إكمال التنفيذ؛ راجع سجل الأدوات.',
                            'Execution failed; review the tool audit.',
                          )}
                    </small>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.data.runs.length && (
          <p className="empty">
            {t('لم تحدث استدعاءات مزود في هذه الشركة.', 'No provider calls in this workspace.')}
          </p>
        )}
      </section>
      <AiToolAudit />
    </main>
  );
}
