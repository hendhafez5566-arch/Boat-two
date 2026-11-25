'use client';
import { WorkspaceHeading } from '../product/ProductUI';
import { statusLabel } from '../product/status';
import { GenerationBudgetPanel } from '../business/GenerationBudgetPanel';
import { ModelCatalog } from '../business/ModelCatalog';
import { ProviderEditor } from '../business/ProviderEditor';
import { AiToolAudit } from '../business/AiToolAudit';
import { AgentRouting } from '../business/AgentRouting';
import { useState } from 'react';
import Link from 'next/link';
import styles from './ai-workspace.module.css';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { useData } from '../business/useData';
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
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const readySources = sources.data.filter((source) => source.status === 'ready');
  const enabledAgents = data.data.agents.filter((agent) => agent.enabled);
  const activeProviders = data.data.providers.filter((provider) => provider.enabled && !provider.retired_at);
  const blankAgent = {
    id: '',
    name: '',
    instructions: '',
    providerId: '',
    sourceIds: [] as string[],
    allowedTools: ['handoff_to_human'],
    enabled: false,
    isDefault: false,
  };
  function showEditor(agent?: Agent) {
    setError('');
    setFeedback('');
    setForm(agent ? {
      id: agent.id,
      name: agent.name,
      instructions: agent.instructions,
      providerId: agent.provider_id || '',
      sourceIds: agent.source_ids,
      allowedTools: agent.allowed_tools,
      enabled: agent.enabled,
      isDefault: agent.is_default,
    } : blankAgent);
    setEditorOpen(true);
    window.setTimeout(() => document.getElementById('agent-editor')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    }), 0);
  }
  async function act(path: string, body: unknown, method = 'POST') {
    setBusy(true);
    setError('');
    setFeedback('');
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
    <section className="stack">
      <div className={styles.intro}>
        <div className={styles.introText}>
          <WorkspaceHeading
            title={t('مساعدو الذكاء الاصطناعي', 'AI Agents')}
            description={t(
              'أنشئ مساعدًا يرد حسب تعليمات شركتك ومصادر المعرفة التي تختارها.',
              'Create an assistant that follows your instructions and selected company knowledge.',
            )}
          />
        </div>
        <button type="button" className="btn btn-primary" onClick={() => showEditor()}>
          + {t('إنشاء مساعد جديد', 'Create assistant')}
        </button>
      </div>
      <section className={styles.guide} aria-label={t('كيف تبدأ', 'Getting started')}>
        <div className={styles.guideHead}>
          <strong>{t('ابدأ في 3 خطوات', 'Get started in 3 steps')}</strong>
          <span>{t('مش لازم تضبط كل الإعدادات التقنية الآن', 'No need to configure everything at once')}</span>
        </div>
        <div className={styles.steps}>
          <Link className={styles.step} href="/dashboard/knowledge">
            <span className={styles.stepNumber}>1</span>
            <span><strong>{t('أضف معلومات الشركة', 'Add company knowledge')}</strong>
              <small>{t('الأسئلة الشائعة، السياسات والخدمات', 'FAQs, policies and services')}</small></span>
          </Link>
          <button className={styles.step} type="button" onClick={() => showEditor()}>
            <span className={styles.stepNumber}>2</span>
            <span><strong>{t('أنشئ المساعد', 'Create your assistant')}</strong>
              <small>{t('اسمه وطريقة كلامه ومصادره', 'Name, instructions and sources')}</small></span>
          </button>
          <div className={styles.step}>
            <span className={styles.stepNumber}>3</span>
            <span><strong>{t('فعّله واربطه بالمحادثات', 'Enable and route to chats')}</strong>
              <small>{t('بعد إعداد مزود AI والاختبار', 'After provider setup and testing')}</small></span>
          </div>
        </div>
      </section>
      <div className={styles.stats} aria-label={t('ملخص الإعداد', 'Setup overview')}>
        <div><strong>{data.data.agents.length}</strong><span>{t('مساعد', 'Agents')}</span></div>
        <div><strong>{enabledAgents.length}</strong><span>{t('مساعد مفعّل', 'Enabled agents')}</span></div>
        <div><strong>{readySources.length}</strong><span>{t('مصدر معرفة جاهز', 'Ready knowledge sources')}</span></div>
        <div><strong>{activeProviders.length}</strong><span>{t('مزود مفعّل داخل الشركة', 'Active workspace providers')}</span></div>
      </div>
      <p className={styles.safetyNote} role="note">
        {t(
          'تنبيه: حفظ المساعد أو تفعيله لا يشغّل مدفوعات AI تلقائيًا. يلزم مزود مهيأ، وسماح بالاستدعاءات، وربط المساعد بالقناة أو التدفق.',
          'Saving or enabling an agent does not activate paid AI calls. A configured provider, enabled generation, and a chat/flow route are required.',
        )}
      </p>
      {(error || data.error) && <p role="alert" className="notice error">{error || data.error}</p>}
      {feedback && <p role="status" className="notice">{feedback}</p>}
      {data.loading && <p role="status">{t('جارٍ تحميل المساعدين…', 'Loading agents…')}</p>}
      <div className={styles.sectionHeading}>
        <div>
          <h2>{t('مساعدوك', 'Your assistants')}</h2>
          <p>{t('اختر مساعدًا لتعديل طريقة رده أو إنشاء مساعد جديد.', 'Choose an agent to edit how it responds, or create a new one.')}</p>
        </div>
      </div>
      {!data.loading && data.data.agents.length === 0 && (
        <section className={styles.empty}>
          <strong>{t('لسه مفيش مساعدين', 'No assistants yet')}</strong>
          <p>{t('ابدأ بمساعد لخدمة العملاء، وخلّيه معطّل لحد ما تجهّز المعرفة وتختبره.', 'Start with a customer-service assistant and leave it disabled until you test its knowledge.')}</p>
          <button type="button" className="btn btn-primary" onClick={() => showEditor()}>{t('إنشاء أول مساعد', 'Create first agent')}</button>
        </section>
      )}
      <div className={styles.agentGrid}>
        {data.data.agents.map((a) => (
          <article className={styles.agentCard} key={a.id}>
            <div className={styles.agentCardHead}>
              <span className={styles.agentAvatar} aria-hidden="true">AI</span>
              <div>
                <h3>{a.name}</h3>
                <span className={a.enabled ? styles.statusActive : styles.statusMuted}>
                  {a.enabled ? t('مفعّل', 'Enabled') : t('غير مفعّل', 'Disabled')}
                  {a.is_default ? ' · ' + t('افتراضي', 'Default') : ''}
                </span>
              </div>
            </div>
            <p className={styles.agentDescription}>
              {a.instructions || t('لم تُضف تعليمات لهذا المساعد بعد.', 'No instructions added yet.')}
            </p>
            <div className={styles.agentMeta}>
              <span>{a.source_ids.length} {t('مصدر معرفة', 'knowledge sources')}</span>
              <span>{a.allowed_tools.length} {t('صلاحية إجراء', 'allowed actions')}</span>
            </div>
            <button type="button" className="btn" onClick={() => showEditor(a)}>{t('إعدادات المساعد', 'Configure agent')}</button>
          </article>
        ))}
      </div>
      {editorOpen && <form
        id="agent-editor"
        className={`card stack ${styles.editor}`}
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
            setForm(blankAgent);
            setEditorOpen(false);
            setFeedback(t('تم حفظ إعدادات المساعد. راجع حالة مزود الخدمة والربط قبل الاستخدام.', 'Agent saved. Check provider and routing status before use.'));
          } catch {
            /* The action helper displays the error. */
          }
        }}
      >
        <div className={styles.sectionHeading}>
          <div>
            <h2>{form.id ? t('تعديل المساعد', 'Edit assistant') : t('مساعد جديد', 'New assistant')}</h2>
            <p>{t('ابدأ بالاسم والتعليمات، ثم اختر مصادر المعرفة والإجراءات.', 'Start with a name and instructions, then choose sources and actions.')}</p>
          </div>
          <button type="button" className="btn" onClick={() => setEditorOpen(false)}>{t('إغلاق', 'Close')}</button>
        </div>
        <div className="form-grid">
          <label className="field">
            {t('الاسم', 'Name')}
            <input
              required
              placeholder={t('مثال: مساعد خدمة العملاء', 'e.g. Customer service assistant')}
              maxLength={100}
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
            placeholder={t(
              'مثال: رد بالعربية بوضوح، واستخدم معلومات الشركة فقط، وحوّل الحالات غير الواضحة لموظف. لا تخترع أسعارًا أو مواعيد.',
              'Example: Reply clearly using only verified company information. Escalate unknown questions. Never invent prices or dates.',
            )}
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          />
        </label>
        <fieldset className={styles.choiceGroup}>
          <legend className="font-bold mb-2">
            {t('المعلومات التي يقدر المساعد يستخدمها', 'Knowledge the assistant can use')}
          </legend>
          <p className={styles.helper}>{t('اختار المصادر الجاهزة فقط. المصدر غير المحدد مش هيستخدمه المساعد.', 'Select ready sources. Unselected sources will not be used by this assistant.')}</p>
          {sources.data.length === 0 && (
            <p className={styles.inlineEmpty}>
              {t('لسه مفيش مصادر معرفة.', 'No knowledge sources yet.')}{' '}
              <Link href="/dashboard/knowledge">{t('اذهب لإضافة المعلومات', 'Add knowledge')}</Link>
            </p>
          )}
          {sources.data.map((s) => (
            <label className="flex gap-2 py-1" key={s.id}>
              <input
                type="checkbox"
                disabled={s.status !== 'ready' && !form.sourceIds.includes(s.id)}
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
              {s.title} · {statusLabel(s.status, t)}
            </label>
          ))}
          <p className="muted">
            {t(
              'المساعد ذو قائمة مصادر فارغة لا يسترجع وثائق؛ أضف المصادر من قاعدة المعرفة.',
              'An agent with no sources retrieves no documents; add sources from Knowledge.',
            )}
          </p>
        </fieldset>
        <details className={styles.subsection}>
          <summary>{t('إجراءات إضافية للمساعد (اختياري)', 'Additional assistant actions (optional)')}</summary>
          <p className={styles.helper}>{t('دي صلاحيات في محادثة العميل الحالي فقط؛ مش صلاحية عامة لحساب الشركة.', 'These permissions affect only the current contact, not the entire workspace.')}</p>
          <fieldset className={styles.choiceGroup}>
          <legend className="font-bold">
            {t('اختر الإجراءات المسموحة', 'Select allowed actions')}
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
        </details>
        <div className={styles.toggleGroup}>
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
        </div>
        <button className="btn btn-primary self-start" disabled={busy}>
          {t('حفظ المساعد', 'Save agent')}
        </button>
      </form>}
      <details className={styles.advanced}>
        <summary>{t('إعدادات متقدمة: المزود والنماذج والميزانية والسجلات', 'Advanced: providers, models, budget and logs')}</summary>
        <div className={styles.advancedBody}>
          <p className={styles.helper}>{t('الأقسام دي لإدارة الربط التقني والتكاليف والتشخيص. مش محتاج تفتحها في كل زيارة.', 'These sections are for technical setup, costs and troubleshooting, not everyday use.')}</p>
      <details className="card workspace-disclosure">
        <summary>{t('مزودو الخدمة', 'Providers')}</summary>
        {data.data.providers.map((p) => (
          <ProviderEditor key={p.id + ':' + p.revision} provider={p} busy={busy} act={act} />
        ))}
        <form
          className="stack"
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
              {t(
                'سعر مليون رمز إدخال بالدولار (اختياري)',
                'USD per million input tokens (optional)',
              )}
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
      </details>
      <ModelCatalog key={data.data.providers.map((p) => p.id + ':' + p.revision).join(',')} />
      <GenerationBudgetPanel />
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
                  {statusLabel(r.status, t)}
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
        </div>
      </details>
    </section>
  );
}
