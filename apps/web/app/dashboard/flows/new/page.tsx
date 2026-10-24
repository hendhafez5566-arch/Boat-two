'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../../lib/api';
import { Graph } from '../../../../lib/flow-types';
import { useLocale } from '../../../../components/product/locale';
import { useData } from '../../../../components/business/useData';
import { NavIcon } from '../../../../components/product/NavIcon';
import TestPanel from '../../../../components/flow/TestPanel';
import { Button, Feedback } from '../../../../components/product/ProductUI';
type Saved = { id: string; updatedAt: string; graph: Graph };
export default function BotWizard() {
  const { t, language } = useLocale(),
    templates = useData<{ id: string; name: string; description: string }[]>(
      '/flows/templates?language=' + language,
      [],
    ),
    channels = useData<{ id: string; name: string; type: string }[]>('/channels', []);
  const [step, setStep] = useState(1),
    [goal, setGoal] = useState(''),
    [template, setTemplate] = useState(''),
    [name, setName] = useState(''),
    [welcome, setWelcome] = useState(''),
    [channel, setChannel] = useState(''),
    [choices, setChoices] = useState<{ title: string; reply: string }[]>([]),
    [created, setCreated] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [validation, setValidation] = useState<string[] | null>(null),
    [published, setPublished] = useState(false);
  const saving = useRef<Promise<Saved> | null>(null),
    flowId = useRef('');
  const labels = [
    t('الهدف', 'Goal'),
    t('القالب', 'Template'),
    t('الترحيب', 'Welcome'),
    t('الأزرار', 'Replies'),
    t('القناة', 'Channel'),
    t('التجربة', 'Preview'),
    t('النشر', 'Publish'),
  ];
  async function saveDraft(): Promise<Saved> {
    if (saving.current) return saving.current;
    saving.current = (async () => {
      if (!flowId.current) {
        const row = await api<{ id: string }>('/flows', {
          method: 'POST',
          body: JSON.stringify({ name, templateId: template, language }),
        });
        flowId.current = row.id;
        setCreated(row.id);
      }
      const row = await api<{ draft_graph: Graph; updated_at: string }>(`/flows/${flowId.current}`),
        graph = row.draft_graph;
      const prefix = '__boat_wizard_',
        old = graph.nodes.find((n) => n.id === prefix + 'welcome'),
        next = old?.edges?.fallback ?? old?.edges?.next ?? graph.startNodeId;
      graph.nodes = graph.nodes.filter((n) => !n.id.startsWith(prefix));
      const buttons = choices.filter((c) => c.title.trim());
      const edges: Record<string, string> = buttons.length ? { fallback: next } : { next };
      buttons.forEach((choice, index) => {
        const id = prefix + 'reply_' + index;
        edges['option:' + id] = id;
        graph.nodes.push({
          id,
          type: 'message',
          position: { x: 80 + index * 300, y: -90 },
          data: { text: choice.reply },
          edges: { next },
        });
      });
      graph.nodes.unshift({
        id: prefix + 'welcome',
        type: 'message',
        position: { x: 200, y: -320 },
        data: {
          text: welcome,
          ...(buttons.length
            ? {
                buttons: buttons.map((c, index) => ({
                  id: prefix + 'reply_' + index,
                  title: c.title,
                })),
              }
            : {}),
        },
        edges,
      });
      graph.startNodeId = prefix + 'welcome';
      const saved = await api<{ updated_at: string }>(`/flows/${flowId.current}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          graph,
          channelIds: [channel],
          expectedUpdatedAt: row.updated_at,
        }),
      });
      return { id: flowId.current, updatedAt: saved.updated_at, graph };
    })().finally(() => {
      saving.current = null;
    });
    return saving.current;
  }
  async function next() {
    setError('');
    setValidation(null);
    if (step === 5) {
      setBusy(true);
      try {
        await saveDraft();
        setStep(6);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    } else setStep(step + 1);
  }
  async function publish() {
    setBusy(true);
    setError('');
    try {
      const saved = await saveDraft();
      const check = await api<{ errors: { message: string }[]; warnings: { message: string }[] }>(
        '/flows/validate',
        { method: 'POST', body: JSON.stringify(saved.graph) },
      );
      setValidation(check.errors.map((e) => e.message));
      if (check.errors.length) return;
      await api(`/flows/${saved.id}/publish`, {
        method: 'POST',
        body: JSON.stringify({ expectedUpdatedAt: saved.updatedAt }),
      });
      setPublished(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const canContinue =
    step === 1
      ? !!goal
      : step === 2
        ? !!template
        : step === 3
          ? !!name.trim() && !!welcome.trim()
          : step === 4
            ? choices.every((c) => !!c.title.trim() && !!c.reply.trim())
            : step === 5
              ? !!channel
              : true;
  return (
    <main className="bot-wizard stack">
      <div className="page-heading">
        <div>
          <h1>{t('من فكرة إلى بوت جاهز', 'From an idea to a ready bot')}</h1>
          <p>
            {t(
              'سبع خطوات واضحة، ومسودة محفوظة قبل التجربة والنشر.',
              'Seven clear steps, with a saved draft before preview and publication.',
            )}
          </p>
        </div>
        <Link className="btn" href={created ? `/dashboard/flows/${created}` : '/dashboard/flows'}>
          {created
            ? t('فتح المسودة في المصمم', 'Open draft in builder')
            : t('العودة إلى البوتات', 'Back to bots')}
        </Link>
      </div>
      <ol className="wizard-stepper" aria-label={t('مراحل إنشاء البوت', 'Bot creation progress')}>
        {labels.map((label, index) => (
          <li
            key={label}
            className={step === index + 1 ? 'is-current' : step > index + 1 ? 'is-complete' : ''}
            aria-current={step === index + 1 ? 'step' : undefined}
          >
            <span>{step > index + 1 ? <NavIcon name="check" /> : index + 1}</span>
            <strong>{label}</strong>
          </li>
        ))}
      </ol>
      {(error || templates.error || channels.error) && (
        <Feedback error>{error || templates.error || channels.error}</Feedback>
      )}
      <div className="wizard-layout">
        <section className="card wizard-content">
          {step === 1 && (
            <>
              <h2>
                {t('ما الذي تريد مساعدة عملائك فيه؟', 'How would you like to help your customers?')}
              </h2>
              <div className="goal-grid">
                {[
                  [
                    'support',
                    'inbox',
                    t('خدمة العملاء', 'Customer support'),
                    t(
                      'إجابات واضحة وتحويل سلس للفريق.',
                      'Clear answers and a smooth team handoff.',
                    ),
                  ],
                  [
                    'sales',
                    'crm',
                    t('جمع العملاء المحتملين', 'Capture leads'),
                    t(
                      'تعرّف إلى احتياجات العميل وتابع الفرص.',
                      'Understand customer needs and follow up.',
                    ),
                  ],
                  [
                    'booking',
                    'sessions',
                    t('الطلبات والحجوزات', 'Requests and bookings'),
                    t(
                      'نظّم الأسئلة واجمع تفاصيل الطلب.',
                      'Organize questions and collect request details.',
                    ),
                  ],
                ].map(([id, icon, title, description]) => (
                  <button
                    key={id}
                    className={`goal-card ${goal === id ? 'is-selected' : ''}`}
                    aria-pressed={goal === id}
                    onClick={() => setGoal(id)}
                  >
                    <NavIcon name={icon} />
                    <strong>{title}</strong>
                    <p>{description}</p>
                  </button>
                ))}
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <h2>{t('ابدأ بقالب، واجعله خاصًا بك', 'Start with a template, make it yours')}</h2>
              <div className="goal-grid">
                {templates.data.map((item) => (
                  <button
                    className={`goal-card ${template === item.id ? 'is-selected' : ''}`}
                    key={item.id}
                    aria-pressed={template === item.id}
                    disabled={!!created}
                    onClick={() => setTemplate(item.id)}
                  >
                    <NavIcon name="flows" />
                    <strong>{item.name}</strong>
                    <p>{item.description}</p>
                  </button>
                ))}
              </div>
              {created && (
                <p className="notice">
                  {t(
                    'القالب محفوظ في المسودة. عدّل الخطوات من المصمم لتغيير بنيته.',
                    'The template is saved in your draft. Use the builder to change its structure.',
                  )}
                </p>
              )}
            </>
          )}
          {step === 3 && (
            <div className="stack">
              <h2>{t('رحّب بعميلك بطريقتك', 'Welcome customers in your own voice')}</h2>
              <label>
                {t('اسم البوت', 'Bot name')}
                <input
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('مساعد خدمة العملاء', 'Customer care assistant')}
                />
              </label>
              <label>
                {t('رسالة الترحيب', 'Welcome message')}
                <textarea
                  rows={5}
                  maxLength={4096}
                  value={welcome}
                  onChange={(e) => setWelcome(e.target.value)}
                  placeholder={t(
                    'أهلًا بك! كيف يمكننا مساعدتك اليوم؟',
                    'Welcome! How can we help you today?',
                  )}
                />
              </label>
            </div>
          )}
          {step === 4 && (
            <div className="stack">
              <h2>{t('اجعل الرد أسهل بأزرار واضحة', 'Make replying easy with clear buttons')}</h2>
              <p className="muted">
                {t(
                  'اختياري: حتى ثلاثة أزرار. بعد الرد يعود العميل إلى القالب الذي اخترته.',
                  'Optional: up to three replies. After the response, customers continue into your selected template.',
                )}
              </p>
              {choices.map((choice, index) => (
                <div className="card stack" key={index}>
                  <label>
                    {t('عنوان الزر', 'Button label')}
                    <input
                      maxLength={20}
                      value={choice.title}
                      onChange={(e) =>
                        setChoices(
                          choices.map((c, i) =>
                            i === index ? { ...c, title: e.target.value } : c,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    {t('الرد عند الاختيار', 'Response when selected')}
                    <textarea
                      maxLength={1000}
                      rows={2}
                      value={choice.reply}
                      onChange={(e) =>
                        setChoices(
                          choices.map((c, i) =>
                            i === index ? { ...c, reply: e.target.value } : c,
                          ),
                        )
                      }
                    />
                  </label>
                  <Button onClick={() => setChoices(choices.filter((_, i) => i !== index))}>
                    {t('إزالة الزر', 'Remove button')}
                  </Button>
                </div>
              ))}
              <Button
                disabled={choices.length >= 3}
                onClick={() => setChoices([...choices, { title: '', reply: '' }])}
              >
                {t('إضافة زر رد', 'Add a reply button')}
              </Button>
            </div>
          )}
          {step === 5 && (
            <div className="stack">
              <h2>{t('أين تبدأ المحادثة؟', 'Where will conversations start?')}</h2>
              {channels.data.map((c) => (
                <button
                  className={`goal-card ${channel === c.id ? 'is-selected' : ''}`}
                  aria-pressed={channel === c.id}
                  key={c.id}
                  onClick={() => setChannel(c.id)}
                >
                  <NavIcon name="channels" />
                  <strong>{c.name}</strong>
                  <small>{c.type}</small>
                </button>
              ))}
              {!channels.data.length && (
                <Feedback>
                  {t(
                    'أضف قناة أولًا. يمكنك استخدام قناة الموقع دون حساب خارجي.',
                    'Add a channel first. A website channel needs no external account.',
                  )}{' '}
                  <Link href="/dashboard/channels">{t('إدارة القنوات', 'Manage channels')}</Link>
                </Feedback>
              )}
            </div>
          )}
          {step === 6 && created && (
            <div className="wizard-preview">
              <h2>{t('جرّب كما يفعل عميلك', 'Try it as your customer would')}</h2>
              <p className="muted">
                {t(
                  'هذه تجربة حقيقية لمسودة البوت. لا ترسل رسائل إلى عملاء خارجيين.',
                  'This runs the actual bot draft without messaging external customers.',
                )}
              </p>
              <TestPanel
                flowId={created}
                beforeRun={async () => {
                  await saveDraft();
                }}
              />
            </div>
          )}
          {step === 7 && (
            <div className="stack">
              <h2>
                {published
                  ? t('بوتك منشور', 'Your bot is published')
                  : t('مراجعة أخيرة، ثم انشر بثقة', 'One final review, then publish')}
              </h2>
              <dl className="wizard-review">
                <dt>{t('البوت', 'Bot')}</dt>
                <dd>{name}</dd>
                <dt>{t('القناة', 'Channel')}</dt>
                <dd>{channels.data.find((c) => c.id === channel)?.name}</dd>
                <dt>{t('رسالة الترحيب', 'Welcome')}</dt>
                <dd>{welcome}</dd>
              </dl>
              {validation?.map((message, index) => (
                <Feedback error key={index}>
                  {message}
                </Feedback>
              ))}
              {published ? (
                <Link className="btn btn-primary" href={`/dashboard/flows/${created}`}>
                  {t('فتح البوت', 'Open bot')}
                </Link>
              ) : (
                <Button variant="primary" busy={busy} onClick={publish}>
                  {t('التحقق ونشر البوت', 'Validate and publish bot')}
                </Button>
              )}
              <p className="muted">
                {t(
                  'النشر يمر بتحقق الخادم وصلاحياتك. الإرسال الخارجي يبقى خاضعًا لبوابات التشغيل والسياسات.',
                  'Publication checks server validation and your permissions. External delivery remains subject to activation gates and channel policies.',
                )}
              </p>
            </div>
          )}
          <footer className="wizard-footer">
            {step > 1 && !published && (
              <Button
                disabled={busy}
                onClick={() => {
                  setStep(step - 1);
                  setValidation(null);
                }}
              >
                {t('السابق', 'Back')}
              </Button>
            )}
            {step < 7 && (
              <Button variant="primary" busy={busy} disabled={!canContinue} onClick={next}>
                {step === 5
                  ? t('حفظ المسودة وتجربتها', 'Save draft and preview')
                  : t('متابعة', 'Continue')}
              </Button>
            )}
            <span>{step} / 7</span>
          </footer>
        </section>
        <aside className="wizard-companion" aria-label={t('معاينة البوت', 'Bot preview')}>
          <div className="phone-preview">
            <header>
              <span className="bot-avatar">
                <NavIcon name="agents" />
              </span>
              <div>
                <strong>{name || t('اسم البوت', 'Bot name')}</strong>
                <small>{t('معاينة مباشرة', 'Live preview')}</small>
              </div>
            </header>
            <div className="phone-body">
              <p className={`chat-bubble ${welcome ? '' : 'is-placeholder'}`}>
                {welcome || t('ستظهر رسالة ترحيبك هنا.', 'Your welcome message will appear here.')}
              </p>
              {choices.length > 0 && (
                <div className="chat-chips">
                  {choices.map((c, i) => (
                    <span className="chat-chip" key={i}>
                      {c.title || t('زر رد', 'Reply button')}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <p className="wizard-tip">
            {t(
              'القالب نقطة بداية، وليس قيدًا. يمكنك فتح المصمم لإضافة شروط وذكاء اصطناعي وتحويل إلى فريقك.',
              'A template is a starting point. Open the builder to add conditions, AI and team handoff.',
            )}
          </p>
        </aside>
      </div>
    </main>
  );
}
