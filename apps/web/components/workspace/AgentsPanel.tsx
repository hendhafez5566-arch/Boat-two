'use client';
import { WorkspaceHeading } from '../product/ProductUI';
import { statusLabel } from '../product/status';
import { GenerationBudgetPanel } from '../business/GenerationBudgetPanel';
import { ModelCatalog } from '../business/ModelCatalog';
import { ProviderEditor } from '../business/ProviderEditor';
import { AiToolAudit } from '../business/AiToolAudit';
import { AgentRouting } from '../business/AgentRouting';
import { useEffect,useRef,useState } from 'react';
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
  const [agentQuery,setAgentQuery]=useState('');
  const [sourceQuery,setSourceQuery]=useState('');
  const [agentStatus,setAgentStatus]=useState('all');
  const [page,setPage]=useState(1);
  const [snapshot,setSnapshot]=useState('');
  const lock=useRef(false);
  const dirty=editorOpen&&JSON.stringify(form)!==snapshot;
  const mayLeave=()=>!lock.current&&(!dirty||window.confirm(t('تغييرات غير محفوظة. تجاهلها؟','Discard unsaved agent changes?')));
  const filtered=data.data.agents.filter(a=>(a.name+' '+a.id).toLowerCase().includes(agentQuery.trim().toLowerCase())&&(agentStatus==='all'||a.enabled===(agentStatus==='enabled')));
  const pages=Math.max(1,Math.ceil(filtered.length/20));
  useEffect(()=>{setPage(1);},[agentQuery,agentStatus]);
  useEffect(()=>{if(page>pages)setPage(pages);},[page,pages]);
  useEffect(()=>{if(!feedback)return;const timer=setTimeout(()=>setFeedback(''),4000);return()=>clearTimeout(timer);},[feedback]);
  useEffect(()=>{const unload=(e:BeforeUnloadEvent)=>{if(dirty||lock.current){e.preventDefault();e.returnValue='';}};const click=(e:MouseEvent)=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return;const a=(e.target as Element)?.closest?.('a[href]') as HTMLAnchorElement|null;if(a&&!a.download&&a.target!=='_blank'&&a.href!==location.href&&!mayLeave()){e.preventDefault();e.stopPropagation();}};window.addEventListener('beforeunload',unload);document.addEventListener('click',click,true);return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',click,true);};},[dirty,t]);
  const readySources = sources.data.filter((source) => source.status === 'ready');
  const enabledAgents = data.data.agents.filter((agent) => agent.enabled);
  const activeProviders = data.data.providers.filter((provider) => provider.enabled && !provider.retired_at);
  const agentCount = (count: number) => data.error ? '—' : data.loading ? '…' : count;
  const sourceCount = sources.error ? '—' : sources.loading ? '…' : readySources.length;

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
    if(!mayLeave())return;
    setError('');setSourceQuery('');
    setFeedback('');
    const next=agent ? {
      id: agent.id,
      name: agent.name,
      instructions: agent.instructions,
      providerId: agent.provider_id || '',
      sourceIds: agent.source_ids,
      allowedTools: agent.allowed_tools,
      enabled: agent.enabled,
      isDefault: agent.is_default,
    } : blankAgent;
    setForm(next);setSnapshot(JSON.stringify(next));
    setEditorOpen(true);
    window.setTimeout(() => document.getElementById('agent-editor')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    }), 0);
  }
  async function act(path: string, body: unknown, method = 'POST') {
    if(lock.current)throw Error(t('يوجد إجراء قيد التنفيذ','An operation is in progress'));
    lock.current=true;setBusy(true);
    setError('');
    setFeedback('');
    try {
      await api(path, { method, body: JSON.stringify(body) });
      await data.reload();
      setFeedback(t('تم حفظ التغييرات','Changes saved'));
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      lock.current=false;setBusy(false);
    }
  }
  return (
    <section className="stack ai-professional" aria-busy={busy}>
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
      <details className={styles.guide} aria-label={t('كيف تبدأ', 'Getting started')}><summary>{t('دليل إعداد المساعد','Assistant setup guide')}</summary>
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
          <button
            className={styles.step}
            type="button"
            onClick={() => {
              const target = document.getElementById('assistant-routing');
              if (target instanceof HTMLDetailsElement) target.open = true;
              target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            <span className={styles.stepNumber}>3</span>
            <span><strong>{t('فعّله واربطه بالمحادثات', 'Enable and route to chats')}</strong>
              <small>{t('بعد إعداد مزود AI والاختبار', 'After provider setup and testing')}</small></span>
          </button>
        </div>
      </details>
      <div className={styles.stats} aria-label={t('ملخص الإعداد', 'Setup overview')}>
        <div><strong>{agentCount(data.data.agents.length)}</strong><span>{t('مساعد', 'Agents')}</span></div>
        <div><strong>{agentCount(enabledAgents.length)}</strong><span>{t('مساعد مفعّل', 'Enabled agents')}</span></div>
        <div><strong>{sourceCount}</strong><span>{t('مصدر معرفة جاهز', 'Ready knowledge sources')}</span></div>
        <div><strong>{agentCount(activeProviders.length)}</strong><span>{t('مزود مفعّل داخل الشركة', 'Active workspace providers')}</span></div>
      </div>
      <p className={styles.safetyNote} role="note">
        {t(
          'تنبيه: حفظ المساعد أو تفعيله لا يشغّل مدفوعات AI تلقائيًا. يلزم مزود مهيأ، وسماح بالاستدعاءات، وربط المساعد بالقناة أو التدفق.',
          'Saving or enabling an agent does not activate paid AI calls. A configured provider, enabled generation, and a chat/flow route are required.',
        )}
      </p>
      {(error || data.error||sources.error) && <p role="alert" className="notice error">{error || data.error||sources.error} {(data.error||sources.error)&&<button className="btn" disabled={busy} onClick={()=>void Promise.all([data.reload(),sources.reload()])}>{t('إعادة المحاولة','Retry')}</button>}</p>}
      {feedback && <p role="status" className="notice">{feedback}</p>}
      {data.loading && <p role="status">{t('جارٍ تحميل المساعدين…', 'Loading agents…')}</p>}
      <div className={styles.sectionHeading}>
        <div>
          <h2>{t('مساعدوك', 'Your assistants')}</h2>
          <p>{t('اختر مساعدًا لتعديل طريقة رده أو إنشاء مساعد جديد.', 'Choose an agent to edit how it responds, or create a new one.')}</p>
        </div>
        {data.data.agents.length>0&&<input type="search" value={agentQuery} onChange={e=>setAgentQuery(e.target.value)} placeholder={t('بحث عن مساعد','Search assistants')} aria-label={t('بحث المساعدين','Search assistants')}/>}
      </div>
      {!data.loading && !data.error && data.data.agents.length === 0 && (
        <section className={styles.empty}>
          <strong>{t('لسه مفيش مساعدين', 'No assistants yet')}</strong>
          <p>{t('ابدأ بمساعد لخدمة العملاء، وخلّيه معطّل لحد ما تجهّز المعرفة وتختبره.', 'Start with a customer-service assistant and leave it disabled until you test its knowledge.')}</p>
          <button type="button" className="btn btn-primary" onClick={() => showEditor()}>{t('إنشاء أول مساعد', 'Create first agent')}</button>
        </section>
      )}
      <div className="form-actions"><select aria-label={t('حالة المساعد','Agent status')} value={agentStatus} onChange={e=>setAgentStatus(e.target.value)}><option value="all">{t('كل الحالات','All statuses')}</option><option value="enabled">{t('مفعّل','Enabled')}</option><option value="disabled">{t('معطّل','Disabled')}</option></select><button className="btn" disabled={!agentQuery&&agentStatus==='all'} onClick={()=>{setAgentQuery('');setAgentStatus('all');}}>{t('مسح الفلاتر','Clear filters')}</button><small>{t('بحث في المساعدين المحملين','Search loaded assistants')}</small></div>
      <div className={styles.agentGrid}>
        {!data.loading&&!data.error&&filtered.slice((page-1)*20,page*20).map((a) => (
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
      {!data.loading&&!data.error&&data.data.agents.length>0&&!filtered.length&&<p className="empty" data-ai-empty="assistants">{t('لا يوجد مساعدون مطابقون','No matching assistants')}</p>}
      {!data.loading&&!data.error&&filtered.length>0&&<div className="form-actions"><span>{filtered.length} · {page}/{pages}</span><button className="btn" disabled={page<=1} onClick={()=>setPage(n=>n-1)}>{t('السابق','Previous')}</button><button className="btn" disabled={page>=pages} onClick={()=>setPage(n=>n+1)}>{t('التالي','Next')}</button></div>}
      {editorOpen && <form
        id="agent-editor"
        className={`card stack ${styles.editor}`}
        onSubmit={async (e) => {
          e.preventDefault();
          if(lock.current||!form.name.trim()||sources.loading||sources.error)return;
          if((form.enabled||form.isDefault)&&!window.confirm(t('تأكيد إعدادات التفعيل والتوجيه الافتراضي؟','Confirm activation and default routing settings?')))return;
          try {
            await act(
              '/agents' + (form.id ? '/' + form.id : ''),
              {
                name: form.name.trim(),
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
          <button type="button" className="btn" disabled={busy} onClick={() => {if(mayLeave())setEditorOpen(false);}}>{t('إغلاق', 'Close')}</button>
        </div>
        <fieldset disabled={busy} className="stack" style={{border:0,padding:0,margin:0,minWidth:0}}>
        {dirty&&<p className="notice" role="status">{t('تغييرات غير محفوظة','Unsaved changes')}</p>}
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
          <input type="search" aria-label={t('بحث مصادر المعرفة','Search knowledge sources')} value={sourceQuery} onChange={e=>setSourceQuery(e.target.value)}/>
          {sources.loading&&<p role="status">{t('جارٍ تحميل المصادر…','Loading sources…')}</p>}
          {!sources.loading&&!sources.error&&sources.data.length === 0 && (
            <p className={styles.inlineEmpty}>
              {t('لسه مفيش مصادر معرفة.', 'No knowledge sources yet.')}{' '}
              <Link href="/dashboard/knowledge">{t('اذهب لإضافة المعلومات', 'Add knowledge')}</Link>
            </p>
          )}
          {!sources.loading&&!sources.error&&sources.data.filter(s=>form.sourceIds.includes(s.id)||(s.title+' '+s.id).toLowerCase().includes(sourceQuery.trim().toLowerCase())).map((s) => (
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
              {s.title} · {s.id.slice(0,8)} · {statusLabel(s.status, t)}
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
        <button className="btn btn-primary self-start" disabled={busy||!form.name.trim()||sources.loading||!!sources.error||(!!form.id&&!dirty)}>
          {t('حفظ المساعد', 'Save agent')}
        </button>
        </fieldset>
      </form>}
      <details id="assistant-routing" className={styles.advanced}>
        <summary>{t('ربط المساعد بقناة أو سيناريو', 'Connect an assistant to a channel or flow')}</summary>
        <div className={styles.advancedBody}>
          <p className={styles.helper}>{t('اختر المساعد والقناة أو التدفق اللي يشتغل فيه. تعيين المساعد مش بيبدأ الرد المدفوع إلا بعد تفعيل الخدمة وتجربتها.', 'Choose the assistant and its channel or flow. Assigning it does not enable paid generation until the service is configured and tested.')}</p>
          <AgentRouting />
        </div>
      </details>
      <details className={styles.advanced}>
        <summary>{t('إدارة تقنية اختيارية', 'Optional technical administration')}</summary>
        <div className={styles.advancedBody}>
          <p className={styles.helper}>
            {t(
              'الإعدادات دي لمسؤول الشركة فقط: ربط مزود AI، ضبط ميزانية الاستدعاءات، ومراجعة السجلات. مش ضرورية لإضافة المعلومات أو تعديل تعليمات المساعد.',
              'For workspace administrators only: connect an AI provider, manage call budgets and inspect logs. Not needed to add knowledge or edit agent instructions.',
            )}
          </p>
          <div className={styles.technicalGroups}>
            <details className={styles.technicalGroup}>
              <summary className={styles.technicalSummary}>
                <span className={styles.technicalIcon} aria-hidden="true">1</span>
                <span className={styles.technicalTitle}>
                  <strong>{t('ربط خدمة الذكاء الاصطناعي', 'Connect an AI provider')}</strong>
                  <small>{t('مفتاح الاتصال وإعداد النموذج — للمسؤول فقط', 'Connection key and model setup — administrators only')}</small>
                </span>
                <span className={styles.technicalCount}>
                  {data.data.providers.filter((provider) => !provider.retired_at).length}
                  {' '}{t('مزود', 'providers')}
                </span>
              </summary>
              <div className={styles.technicalBody}>
                <p className={styles.helper}>
                  {t('المزود هو الخدمة اللي بتولّد الردود، زي OpenAI أو Anthropic. حفظ مزود جديد بيكون معطّلًا حتى تراجعه وتفعّله.', 'A provider generates the replies, such as OpenAI or Anthropic. Newly saved providers remain disabled until reviewed.')}
                </p>
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
          <fieldset disabled={busy} className="stack" style={{border:0,padding:0,margin:0,minWidth:0}}>
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
              <input name="name" required maxLength={100} />
            </label>
            <label className="field">
              {t('معرّف النموذج', 'Model identifier')}
              <input required name="model" dir="ltr" maxLength={100} pattern="[a-zA-Z0-9._-]{1,100}" />
            </label>
            <label className="field">
              {t('مفتاح API', 'API key')}
              <input required name="apiKey" type="password" minLength={10} maxLength={4000} autoComplete="off" />
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
          </fieldset>
        </form>
                <details className={styles.nestedTechnical}>
                  <summary>{t('سجل النماذج وإصدارات التسعير', 'Model and pricing version history')}</summary>
                  <div className={styles.nestedTechnicalBody}>
                    <ModelCatalog key={data.data.providers.map((p) => p.id + ':' + p.revision).join(',')} />
                  </div>
                </details>
              </div>
            </details>
            <details className={styles.technicalGroup}>
              <summary className={styles.technicalSummary}>
                <span className={styles.technicalIcon} aria-hidden="true">2</span>
                <span className={styles.technicalTitle}>
                  <strong>{t('حدود استخدام الذكاء الاصطناعي', 'AI usage limits')}</strong>
                  <small>{t('عدد المحاولات والتوكنز والميزانية — مش فاتورة فعلية', 'Attempts, tokens and budget — not a provider invoice')}</small>
                </span>
              </summary>
              <div className={styles.technicalBody}>
                <p className={styles.helper}>
                  {t('لو الميزانية أو الحد الشهري وصل للصفر المتبقي، النظام ممكن يمنع استدعاءات جديدة. غيّرها بحذر بعد مراجعة تكلفة المزود.', 'When monthly allowances are exhausted, new AI calls may be blocked. Review provider costs before changing limits.')}
                </p>
                <GenerationBudgetPanel />
              </div>
            </details>
            <details className={styles.technicalGroup}>
              <summary className={styles.technicalSummary}>
                <span className={styles.technicalIcon} aria-hidden="true">3</span>
                <span className={styles.technicalTitle}>
                  <strong>{t('سجل التشغيل والمراجعة', 'Activity and audit logs')}</strong>
                  <small>{t('تفاصيل المحاولات ونتائج الإجراءات عند تشخيص مشكلة', 'Call outcomes and action history for troubleshooting')}</small>
                </span>
                <span className={styles.technicalCount}>
                  {data.data.runs.length}
                  {' '}{t('استدعاء حديث', 'recent calls')}
                </span>
              </summary>
              <div className={styles.technicalBody}>
                <section className="card table-wrap">
                  <h2>{t('آخر استدعاءات AI', 'Recent AI calls')}</h2>
                  {data.data.runs.length > 0 && <table className="product-table">
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
                  </table>}
                  {!data.data.runs.length && (
                    <p className={styles.technicalEmpty}>
                      {t('مافيش استدعاءات مسجلة حتى الآن. دي مش مشكلة لو المساعد لسه متفعّلش.', 'No AI calls recorded yet. This is expected before the assistant is used.')}
                    </p>
                  )}
                </section>
                <details className={styles.nestedTechnical}>
                  <summary>{t('سجل أدوات المساعد', 'Assistant action audit')}</summary>
                  <div className={styles.nestedTechnicalBody}>
                    <AiToolAudit />
                  </div>
                </details>
              </div>
            </details>
          </div>
        </div>
      </details>
    </section>
  );
}
