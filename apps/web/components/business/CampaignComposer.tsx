'use client';
import { AudienceFilterSelect } from './AudienceFilterSelect';
import styles from './campaign-configuration.module.css';
import { useData } from './useData';
import AudienceSummary, { Audience } from './AudienceSummary';
import {
  RichCampaignContent,
  CampaignContentPreview,
  validCampaignContent,
  CampaignContent,
} from './RichCampaignContent';
import {
  TemplateParameters,
  TemplatePreview,
  TemplateValue,
  ApprovedTemplate,
  validTemplateValue,
} from './TemplateParameters';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
type Channel = { id: string; name: string; type: string };
type Segment = { id: string; name: string; filters: Record<string, string> };
type Template = ApprovedTemplate;
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
  layout = 'wizard',
}: {
  channels: Channel[];
  segments: Segment[];
  onSaved: () => Promise<void>;
  layout?: 'wizard' | 'reference';
}) {
  const { t } = useLocale();
  const reference = layout === 'reference';
  const [includeTags, setIncludeTags] = useState<string[]>([]);
  const [excludeTags, setExcludeTags] = useState<string[]>([]);
  const [includeListIds, setIncludeListIds] = useState<string[]>([]);
  const [excludeListIds, setExcludeListIds] = useState<string[]>([]);
  const labelOptions = useData<{ name: string }[]>(reference ? '/campaigns/labels' : null, []);
  const [broadcastMode, setBroadcastMode] = useState<'window' | 'template'>('window');
  const lists = useData<{ id: string; name: string }[]>(reference ? '/contact-lists' : null, []);
  const [step, setStep] = useState(0),
    [name, setName] = useState(''),
    [channel, setChannel] = useState(channels.length === 1 ? channels[0].id : ''),
    [segment, setSegment] = useState('');
  const [rich, setRich] = useState<CampaignContent>({});
  const [frequency, setFrequency] = useState(24),
    [text, setText] = useState(''),
    [template, setTemplate] = useState(''),
    [templateValue, setTemplateValue] = useState<TemplateValue>({
      name: '',
      language: '',
      bodyParams: [],
    });
  const [templates, setTemplates] = useState<Template[]>([]),
    [loading, setLoading] = useState(false);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const review = useRef(0),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (channel && !channels.some((c) => c.id === channel)) {
      setChannel('');
      setAudience(null);
      setStep(0);
    }
  }, [channels, channel]);
  const selectedChannel = channels.find((c) => c.id === channel),
    filters = {
      ...(segments.find((s) => s.id === segment)?.filters || {}),
      ...(includeTags.length ? { includeTags } : {}),
      ...(excludeTags.length ? { excludeTags } : {}),
      ...(includeListIds.length ? { includeListIds } : {}),
      ...(excludeListIds.length ? { excludeListIds } : {}),
    };
  const selectedTemplate = templates.find((x) => x.name + '|' + x.language === template);
  const validContent =
    reference &&
    selectedChannel?.type === 'whatsapp' &&
    broadcastMode === 'template' &&
    !selectedTemplate
      ? false
      : selectedTemplate
        ? validTemplateValue(selectedTemplate, templateValue)
        : validCampaignContent({ ...rich, text });
  useEffect(() => {
    let active = true;
    setTemplate('');
    if (reference && selectedChannel?.type === 'whatsapp') setBroadcastMode('template');
    setTemplates([]);
    setTemplateValue({ name: '', language: '', bodyParams: [] });
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
  }, [channel, selectedChannel?.type, reference]);
  useEffect(() => {
    review.current++;
    setAudience(null);
  }, [channel, segment, includeTags, excludeTags, includeListIds, excludeListIds]);
  async function checkAudience() {
    const version = ++review.current;
    setBusy(true);
    setError('');
    try {
      const result = await api<Audience>('/campaigns/audience', {
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
    setSaving(true);
    setError('');
    try {
      // Counts are advisory; scheduling and each send still recheck consent and channel policy.
      const current = await api<Audience>('/campaigns/audience', {
        method: 'POST',
        body: JSON.stringify({ channelId: channel, filters }),
      });
      setAudience(current);
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
                  ...templateValue,
                  name: selectedTemplate.name,
                  language: selectedTemplate.language,
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
      setSaving(false);
    }
  }
  const labels = [
    t('القناة والجمهور', 'Channel & audience'),
    t('كتابة الرسالة', 'Compose message'),
    t('المعاينة والمراجعة', 'Preview & review'),
  ];
  return (
    <section
      className={reference ? styles.configuration : 'card stack'}
      aria-label={t('إنشاء حملة', 'Create campaign')}
    >
      {!reference && (
        <>
          <h2 ref={heading} tabIndex={-1}>
            {t('حملة جديدة', 'New campaign')} ·{' '}
            {t(`الخطوة ${step + 1} من 3`, `Step ${step + 1} of 3`)}
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
        </>
      )}
      {reference && (
        <div className={styles.actionType}>
          <strong>{t('نوع الإجراء', 'Action Type')}</strong>
          <span>{t('حملة بث', 'Broadcasting')}</span>
        </div>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {(reference || step === 0) && (
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
          {reference && (
            <div className={styles.filterGrid}>
              <AudienceFilterSelect
                label={t('تضمين الوسوم', 'Include label ids')}
                options={labelOptions.data.map(({ name }) => ({ id: name, name }))}
                value={includeTags}
                onChange={setIncludeTags}
                disabled={labelOptions.loading || !!labelOptions.error}
              />
              <AudienceFilterSelect
                label={t('استبعاد الوسوم', 'Exclude label ids')}
                options={labelOptions.data.map(({ name }) => ({ id: name, name }))}
                value={excludeTags}
                onChange={setExcludeTags}
                disabled={labelOptions.loading || !!labelOptions.error}
              />
              <AudienceFilterSelect
                label={t('تضمين قوائم المشتركين', 'Include Subscriber Lists')}
                options={lists.data}
                value={includeListIds}
                onChange={setIncludeListIds}
                disabled={lists.loading || !!lists.error}
              />
              <AudienceFilterSelect
                label={t('استبعاد قوائم المشتركين', 'Exclude Subscriber Lists')}
                options={lists.data}
                value={excludeListIds}
                onChange={setExcludeListIds}
                disabled={lists.loading || !!lists.error}
              />
              {labelOptions.error && <p role="alert">{labelOptions.error}</p>}
              {lists.error && <p role="alert">{lists.error}</p>}
            </div>
          )}
          <button type="button" className="btn" disabled={!channel || busy} onClick={checkAudience}>
            {busy && !saving
              ? t('جارٍ مراجعة الجمهور…', 'Reviewing audience…')
              : t('مراجعة الجمهور', 'Review audience')}
          </button>
          {audience && (
            <>
              <AudienceSummary audience={audience} />
              {!audience.eligible && (
                <p className="notice">
                  {t(
                    'يمكنك متابعة كتابة الرسالة وحفظ مسودة. الجدولة تتطلب جمهورًا مؤهلًا وتظل مستقلة عن الحفظ.',
                    'You can compose and save a draft. Scheduling requires an eligible audience and remains separate from saving.',
                  )}
                </p>
              )}
            </>
          )}
          {!reference && (
            <button
              className="btn btn-primary"
              disabled={
                !name.trim() ||
                !channel ||
                !audience ||
                !Number.isInteger(frequency) ||
                frequency < 1 ||
                frequency > 720 ||
                busy
              }
              onClick={() => move(1)}
            >
              {t('التالي', 'Next')}
            </button>
          )}
        </div>
      )}
      {(reference || step === 1) && (
        <div className="stack">
          {reference && <h3>{t('نوع البث والمحتوى', 'Broadcast type and content')}</h3>}
          {reference && selectedChannel?.type === 'whatsapp' && (
            <fieldset className={styles.broadcastTypes}>
              <legend>{t('نوع البث', 'Broadcast type')}</legend>
              <label>
                <input
                  type="radio"
                  name="broadcastMode"
                  checked={broadcastMode === 'window'}
                  onChange={() => {
                    setBroadcastMode('window');
                    setTemplate('');
                  }}
                />
                <strong>{t('24 ساعة', '24 hours')}</strong>
                <small>{t('داخل نافذة الرد', 'Within the reply window')}</small>
              </label>
              <label>
                <input
                  type="radio"
                  name="broadcastMode"
                  checked={broadcastMode === 'template'}
                  onChange={() => setBroadcastMode('template')}
                />
                <strong>{t('في أي وقت', 'Anytime')}</strong>
                <small>{t('قالب WhatsApp معتمد', 'Approved WhatsApp template')}</small>
              </label>
            </fieldset>
          )}
          {selectedChannel?.type === 'whatsapp' && (!reference || broadcastMode === 'template') && (
            <label className="field">
              {t('قالب WhatsApp المعتمد', 'Approved WhatsApp template')}
              <select
                disabled={loading}
                value={template}
                onChange={(e) => {
                  setTemplate(e.target.value);
                  const next = templates.find((x) => x.name + '|' + x.language === e.target.value);
                  setTemplateValue({
                    name: next?.name ?? '',
                    language: next?.language ?? '',
                    bodyParams: [],
                  });
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
            selectedTemplate && (
              <TemplateParameters
                definition={selectedTemplate}
                value={templateValue}
                onChange={setTemplateValue}
              />
            )
          ) : !reference || selectedChannel?.type !== 'whatsapp' || broadcastMode === 'window' ? (
            <>
              {!reference && (
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
              )}
              <RichCampaignContent
                value={{ ...rich, text }}
                onChange={(value) => {
                  setText(value.text ?? '');
                  setRich(value);
                }}
              />
            </>
          ) : (
            <p>
              {t(
                'اختر قالبًا معتمدًا لإكمال المحتوى.',
                'Choose an approved template to complete the content.',
              )}
            </p>
          )}
          <p className="muted">
            {t(
              'يدعم النص والوسائط وأزرار الرد والقوائم والقوالب المعتمدة بترويسات وأزرار مدعومة. تخضع نافذة الرد والموافقة وسياسة القناة للفحص عند الإرسال.',
              'Supports text, media, reply buttons, menus and approved templates with supported headers and buttons. Reply windows, consent and channel policy are checked at delivery.',
            )}
          </p>
          {!reference && (
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
          )}
        </div>
      )}
      {(reference || step === 2) && (
        <div className="stack">
          <h3>{name || t('معاينة الرسالة', 'Message Preview')}</h3>
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
            {selectedTemplate ? (
              <TemplatePreview definition={selectedTemplate} value={templateValue} />
            ) : (
              <CampaignContentPreview content={{ ...rich, text }} />
            )}
          </article>
          <p className="notice">
            {t(
              'هذه معاينة للمحتوى وليست محاكاة لشكل تطبيق المزود. سيتم حفظ مسودة فقط؛ راجعها قبل الجدولة.',
              'This previews content; provider app appearance may differ. Saving creates a draft. Review it before scheduling.',
            )}
          </p>
          <div className="form-actions">
            {!reference && (
              <button className="btn" disabled={busy} onClick={() => move(1)}>
                {t('تعديل الرسالة', 'Edit message')}
              </button>
            )}
            <button
              className="btn btn-primary"
              disabled={
                busy ||
                loading ||
                !validContent ||
                !name.trim() ||
                !channel ||
                (reference &&
                  (!audience || !Number.isInteger(frequency) || frequency < 1 || frequency > 720))
              }
              onClick={save}
            >
              {saving ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ المسودة', 'Save draft')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
