'use client';
import {
  RichCampaignContent,
  CampaignContentPreview,
  validCampaignContent,
  CampaignContent,
} from './RichCampaignContent';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
type Channel = { id: string; name: string; type: string };
type Segment = { id: string; name: string; filters: Record<string, string> };
type Template = {
  name: string;
  language: string;
  body: string;
  status: string;
  supported: boolean;
};
const copy = [
  [
    'متابعة الاهتمام',
    'Lead follow-up',
    'شكرًا لاهتمامك! كيف يمكننا مساعدتك في اختيار الخدمة المناسبة؟',
    'Thank you for your interest! How can we help you choose the right service?',
  ],
  [
    'تذكير بموعد',
    'Appointment reminder',
    'تذكير بموعدك القادم. يرجى الرد لتأكيده أو طلب تغييره.',
    'A reminder about your upcoming appointment. Please reply to confirm or request a change.',
  ],
  [
    'طلب تقييم',
    'Feedback request',
    'يسعدنا معرفة رأيك في تجربتك الأخيرة. ما الذي يمكننا تحسينه؟',
    'We would love your feedback on your recent experience. What can we improve?',
  ],
  [
    'الترحيب',
    'Welcome',
    'أهلًا بك! يسعدنا انضمامك. أخبرنا بما تبحث عنه وسنساعدك.',
    'Welcome! We are glad you joined us. Tell us what you need and we will help.',
  ],
  [
    'إعادة التواصل',
    'Reconnect',
    'مرحبًا، هل ما زلت تحتاج إلى مساعدة؟ يمكنك الرد لنتابع معك.',
    'Hello, do you still need help? Reply and we can follow up with you.',
  ],
  [
    'تحديث الخدمة',
    'Service update',
    'لدينا تحديث بخصوص الخدمة التي طلبتها. يرجى التواصل معنا لمعرفة التفاصيل.',
    'We have an update about your requested service. Please contact us for details.',
  ],
];
export function CampaignComposer({
  channels,
  segments,
  onSaved,
}: {
  channels: Channel[];
  segments: Segment[];
  onSaved: () => Promise<void>;
}) {
  const { t } = useLocale();
  const [step, setStep] = useState(0),
    [name, setName] = useState(''),
    [channel, setChannel] = useState(''),
    [segment, setSegment] = useState('');
  const [rich, setRich] = useState<CampaignContent>({});
  const [frequency, setFrequency] = useState(24),
    [text, setText] = useState(''),
    [template, setTemplate] = useState(''),
    [parameters, setParameters] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]),
    [loading, setLoading] = useState(false);
  const [audience, setAudience] = useState<{ matched: number; eligible: number } | null>(null);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const review = useRef(0),
    heading = useRef<HTMLHeadingElement>(null);
  const selectedChannel = channels.find((c) => c.id === channel),
    filters = segments.find((s) => s.id === segment)?.filters || {};
  const selectedTemplate = templates.find((x) => x.name + '|' + x.language === template);
  const values = parameters.split('\n').filter(Boolean);
  const preview = selectedTemplate
    ? selectedTemplate.body.replace(/\{\{(\d+)\}\}/g, (match, n) => values[Number(n) - 1] || match)
    : text;
  const validContent = selectedTemplate
    ? !/\{\{\d+\}\}/.test(preview)
    : validCampaignContent({ ...rich, text });
  useEffect(() => {
    let active = true;
    setTemplate('');
    setTemplates([]);
    setParameters('');
    setError('');
    setLoading(selectedChannel?.type === 'whatsapp');
    if (selectedChannel?.type === 'whatsapp')
      api<Template[]>('/channels/' + channel + '/templates')
        .then((rows) => {
          if (active)
            setTemplates(rows.filter((x) => x.status === 'APPROVED' && x.supported === true));
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    return () => {
      active = false;
    };
  }, [channel, selectedChannel?.type]);
  useEffect(() => {
    review.current++;
    setAudience(null);
  }, [channel, segment]);
  async function checkAudience() {
    const version = ++review.current;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ matched: number; eligible: number }>('/campaigns/audience', {
        method: 'POST',
        body: JSON.stringify({ channelId: channel, filters }),
      });
      if (version === review.current) setAudience(result);
    } catch (e) {
      if (version === review.current) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function move(next: number) {
    setStep(next);
    setError('');
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      // Counts are advisory; scheduling and each send still recheck consent and channel policy.
      const current = await api<{ eligible: number; matched: number }>('/campaigns/audience', {
        method: 'POST',
        body: JSON.stringify({ channelId: channel, filters }),
      });
      setAudience(current);
      if (!current.eligible)
        throw new Error(
          t(
            'لا يوجد جمهور مؤهل حاليًا. راجع القناة والموافقة.',
            'No eligible audience now. Review the channel and consent.',
          ),
        );
      await api('/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name,
          channelId: channel,
          filters,
          frequencyHours: frequency,
          content: selectedTemplate
            ? {
                template: {
                  name: selectedTemplate.name,
                  language: selectedTemplate.language,
                  bodyParams: values,
                },
              }
            : { ...rich, text: text.trim() },
        }),
      });
      setStep(0);
      setName('');
      setText('');
      setRich({});
      setAudience(null);
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const labels = [
    t('القناة والجمهور', 'Channel & audience'),
    t('كتابة الرسالة', 'Compose message'),
    t('المعاينة والمراجعة', 'Preview & review'),
  ];
  return (
    <section className="card stack" aria-label={t('إنشاء حملة', 'Create campaign')}>
      <h2 ref={heading} tabIndex={-1}>
        {t('حملة جديدة', 'New campaign')} · {step + 1}/3
      </h2>
      <ol className="flex flex-wrap gap-3" aria-label={t('خطوات الإنشاء', 'Creation steps')}>
        {labels.map((label, index) => (
          <li
            key={label}
            aria-current={step === index ? 'step' : undefined}
            className={step === index ? 'badge' : 'muted'}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {step === 0 && (
        <div className="stack">
          <div className="form-grid">
            <label className="field">
              {t('اسم الحملة', 'Campaign name')}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                required
              />
            </label>
            <label className="field">
              {t('القناة', 'Channel')}
              <select
                aria-label={t('القناة', 'Channel')}
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                required
              >
                <option value="">{t('اختر قناة', 'Choose channel')}</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.type}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('الجمهور', 'Audience')}
              <select
                aria-label={t('الجمهور', 'Audience')}
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
              >
                <option value="">{t('كل جهات الاتصال المؤهلة', 'All eligible contacts')}</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('أقل ساعات بين الحملات لكل عميل', 'Minimum hours between campaigns per contact')}
              <input
                type="number"
                min={1}
                max={720}
                value={frequency}
                onChange={(e) => setFrequency(Number(e.target.value))}
              />
            </label>
          </div>
          <button className="btn" disabled={!channel || busy} onClick={checkAudience}>
            {t('مراجعة الجمهور', 'Review audience')}
          </button>
          {audience && (
            <p role="status">
              {audience.eligible} {t('مؤهل من', 'eligible of')} {audience.matched}
            </p>
          )}
          <button
            className="btn btn-primary"
            disabled={
              !name.trim() ||
              !channel ||
              !audience?.eligible ||
              !Number.isInteger(frequency) ||
              frequency < 1 ||
              frequency > 720 ||
              busy
            }
            onClick={() => move(1)}
          >
            {t('التالي', 'Next')}
          </button>
        </div>
      )}
      {step === 1 && (
        <div className="stack">
          {selectedChannel?.type === 'whatsapp' && (
            <label className="field">
              {t('قالب WhatsApp المعتمد', 'Approved WhatsApp template')}
              <select
                disabled={loading}
                value={template}
                onChange={(e) => {
                  setTemplate(e.target.value);
                  setParameters('');
                }}
              >
                <option value="">
                  {t('نص داخل نافذة الرد فقط', 'Text within reply window only')}
                </option>
                {templates.map((x) => (
                  <option key={x.name + x.language} value={x.name + '|' + x.language}>
                    {x.name} · {x.language}
                  </option>
                ))}
              </select>
            </label>
          )}
          {loading && <p role="status">{t('تحميل القوالب…', 'Loading templates…')}</p>}
          {template ? (
            <>
              <p className="notice whitespace-pre-wrap">{selectedTemplate?.body}</p>
              <label className="field">
                {t('قيم القالب، قيمة في كل سطر', 'Template values, one per line')}
                <textarea
                  value={parameters}
                  onChange={(e) => setParameters(e.target.value)}
                  rows={4}
                />
              </label>
            </>
          ) : (
            <>
              <div className="form-grid">
                {copy.map(([ar, en, arText, enText]) => (
                  <button
                    type="button"
                    className="btn"
                    key={en}
                    onClick={() => setText(t(arText, enText))}
                  >
                    {t(ar, en)}
                  </button>
                ))}
              </div>
              <RichCampaignContent
                value={{ ...rich, text }}
                onChange={(value) => {
                  setText(value.text ?? '');
                  setRich(value);
                }}
              />
            </>
          )}
          <p className="muted">
            {t(
              'يدعم النص والوسائط وأزرار الرد والقوائم وقوالب BODY المعتمدة. تخضع نافذة الرد والموافقة وسياسة القناة للفحص عند الإرسال.',
              'Supports text, media, reply buttons, menus and approved BODY templates. Reply windows, consent and channel policy are checked at delivery.',
            )}
          </p>
          <div className="form-actions">
            <button className="btn" onClick={() => move(0)}>
              {t('السابق', 'Back')}
            </button>
            <button
              className="btn btn-primary"
              disabled={!validContent || loading}
              onClick={() => move(2)}
            >
              {t('معاينة الرسالة', 'Preview message')}
            </button>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="stack">
          <h3>{name}</h3>
          <p>
            {selectedChannel?.name} ·{' '}
            {segments.find((s) => s.id === segment)?.name ||
              t('كل المؤهلين', 'All eligible contacts')}{' '}
            · {frequency} {t('ساعة', 'hours')}
          </p>
          <article
            className="card whitespace-pre-wrap"
            aria-label={t('معاينة الرسالة', 'Message preview')}
          >
            {template ? preview : <CampaignContentPreview content={{ ...rich, text }} />}
          </article>
          <p className="notice">
            {t(
              'هذه معاينة للمحتوى وليست محاكاة لشكل تطبيق المزود. سيتم حفظ مسودة فقط؛ راجعها قبل الجدولة.',
              'This previews content; provider app appearance may differ. Saving creates a draft. Review it before scheduling.',
            )}
          </p>
          <div className="form-actions">
            <button className="btn" disabled={busy} onClick={() => move(1)}>
              {t('تعديل الرسالة', 'Edit message')}
            </button>
            <button className="btn btn-primary" disabled={busy || !validContent} onClick={save}>
              {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ المسودة', 'Save draft')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
