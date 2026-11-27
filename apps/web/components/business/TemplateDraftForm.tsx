'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { NavIcon } from '../product/NavIcon';
import studio from './template-studio.module.css';
import { templateLocales } from './template-locales';
import { useLocale } from '../product/locale';
type Header = {
  type: 'HEADER';
  format: string;
  text?: string;
  example?: { header_text?: string[]; header_handle?: string[] };
};
type DraftButton = {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
  example?: string[];
};
export type TemplateRow = {
  id: string;
  name: string;
  language: string;
  category: string;
  body: string;
  examples: string[];
  components: {
    type: string;
    format?: string;
    text?: string;
    example?: Header['example'] & { body_text?: string[][] };
    buttons?: DraftButton[];
  }[];
  status: string;
  supported: boolean;
  error: string | null;
  revision: number;
};
export function TemplateDraftForm({
  initial,
  busy,
  save,
  cancel,
  saveAndReview,
  uploadMedia,
}: {
  initial?: TemplateRow;
  busy: boolean;
  save: (draft: unknown) => Promise<boolean>;
  uploadMedia?: (file: File, format: string) => Promise<string>;
  saveAndReview?: (draft: unknown) => Promise<boolean>;
  cancel?: () => void;
}) {
  const { t, language: uiLanguage } = useLocale();
  const mediaHintId = useId();
  const h = initial?.components.find((c) => c.type === 'HEADER');
  const [format, setFormat] = useState(h?.format || 'NONE');
  const [name, setName] = useState(initial?.name || '');
  const [language, setLanguage] = useState(initial?.language || 'ar');
  const [category, setCategory] = useState(initial?.category || 'UTILITY');
  const [body, setBody] = useState(initial?.body || '');
  const [examples, setExamples] = useState(initial?.examples.join('\n') || '');
  const [headerText, setHeaderText] = useState(h?.text || '');
  const [headerSample, setHeaderSample] = useState(
    h?.example?.header_text?.[0] || h?.example?.header_handle?.[0] || '',
  );
  const [filePreview, setFilePreview] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  useEffect(
    () => () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    },
    [filePreview],
  );
  const [footer, setFooter] = useState(
    initial?.components.find((c) => c.type === 'FOOTER')?.text || '',
  );
  const [buttons, setButtons] = useState<DraftButton[]>(
    initial?.components.find((c) => c.type === 'BUTTONS')?.buttons || [],
  );
  function update(index: number, next: Partial<DraftButton>) {
    setButtons(buttons.map((b, i) => (i === index ? { ...b, ...next } : b)));
  }
  const [step, setStep] = useState(0);
  const [designError, setDesignError] = useState('');
  const bodyRef=useRef<HTMLTextAreaElement>(null);
  const [optionsOpen,setOptionsOpen]=useState(format!=='NONE'||!!footer||buttons.length>0);
  const samples = examples.split('\n');
  const tokens = [...new Set([...body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => match[1]))];
  const numbered =
    tokens.length <= 20 &&
    tokens.every((token, index) => token === String(index + 1)) &&
    !/\{\{|\}\}/.test(body.replace(/\{\{\d+\}\}/g, ''));

  const steps = [
    t('معلومات القالب', 'Template details'),
    t('تصميم الرسالة', 'Message design'),
    t('المعاينة والمراجعة', 'Preview and review'),
  ];
  function insertVariable(){
    if(!numbered||tokens.length>=20)return;
    const value='{{'+(tokens.length+1)+'}}';
    const input=bodyRef.current;
    // Append after the last existing variable to preserve numbering.
    const at=Math.max(input?.selectionEnd??body.length,body.lastIndexOf('{{')<0?0:body.lastIndexOf('}}')+2);
    const next=body.slice(0,at)+value+body.slice(at);
    if(next.length>1024)return;
    setBody(next);setDesignError('');
    requestAnimationFrame(()=>{input?.focus();input?.setSelectionRange(at+value.length,at+value.length);});
  }
  const basicFields = (
    <div className={studio.draftFields}>
      {!initial && !name && !body && <button type="button" className={studio.starter} onClick={() => {
        setName('booking_quote_follow_up');
        setLanguage('ar');
        setCategory('UTILITY');
        setBody('مرحبًا {{1}}، بخصوص طلب عرض السعر الذي طلبته لخدمة {{2}}، الإجمالي {{3}}. إذا رغبت في المتابعة، يرجى الرد حتى نراجع التوفر معك.');
        setExamples('محمد\nغرفة رباعية\n٤١٬٠٠٠ جنيه مصري');
      }}><NavIcon name="bolt"/><span>{t('ابدأ بقالب متابعة عرض سعر', 'Start with a quote follow-up template')}</span><NavIcon name="plus"/></button>}
      <label className="field">
        {t('اسم القالب بالإنجليزية', 'Template name in English')}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="booking_confirmation"
          pattern="[a-z0-9_]+"
          maxLength={512}
          required
          dir="ltr"
        /><small>{t('حروف إنجليزية صغيرة وأرقام وشرطة سفلية فقط.','Lowercase letters, numbers and underscores only.')}</small>
      </label>
      <label className="field">
        {t('اللغة', 'Language')}
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          {!templateLocales.some(([code]) => code === language) && (
            <option value={language}>{language}</option>
          )}
          {templateLocales.map(([code, label]) => (
            <option key={code} value={code}>
              {uiLanguage === 'ar'
                ? new Intl.DisplayNames(['ar'], { type: 'language' }).of(code.replace('_', '-')) ||
                  label
                : label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        {t('التصنيف', 'Category')}
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="UTILITY">{t('خدمي', 'Utility')}</option>
          <option value="MARKETING">{t('تسويقي', 'Marketing')}</option>
        </select>
      </label>
    </div>
  );
  const contentFields = (
    <>
      <div className={studio.messageEditor}><div className={studio.fieldTitle}><label htmlFor={mediaHintId+'-body'}>{t('نص الرسالة','Message text')}</label><button type="button" className="btn" disabled={!numbered||tokens.length>=20||body.length+8>1024} onClick={insertVariable}><NavIcon name="variable"/>{t('إضافة متغير','Add variable')}</button></div>
        <textarea ref={bodyRef} id={mediaHintId+'-body'}
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1024}
          rows={4}
          placeholder={t('مثال: تم تأكيد حجزك رقم {{1}}.', 'Example: Booking {{1}} is confirmed.')}
        />
      <div className={studio.fieldTitle}><small>{t('استخدم المتغيرات لتخصيص الرسالة لكل عميل.','Use variables to personalize messages.')}</small><small><bdi>{body.length}/1024</bdi></small></div></div>
      {!numbered&&<p className={studio.validation} role="alert"><NavIcon name="flag"/>{t('رتّب المتغيرات بدءًا من {{1}} بدون تخطي رقم.','Use consecutive variables starting at {{1}}.')}</p>}
      {numbered&&tokens.length>0&&<section className={studio.samplePanel}><h3><NavIcon name="variable"/>{t('أمثلة المتغيرات','Variable examples')} <span>{tokens.length}</span></h3><small>{t('أدخل أمثلة غير حساسة للمراجعة والمعاينة.','Use non-sensitive examples for review and preview.')}</small><div className={studio.sampleGrid}>
        {tokens.map((token, index) => (
          <label className={studio.sampleRow} key={token}>
            <bdi>{'{{' + token + '}}'}</bdi>
            <input
              required aria-label={t('مثال المتغير','Variable example')+' '+token} placeholder={t('قيمة تجريبية','Sample value')}
              maxLength={500}
              value={samples[index] || ''}
              onChange={(event) => {
                const next = [...samples];
                next[index] = event.target.value;
                setExamples(next.join('\n'));
              }}
            />
          </label>
        ))}</div></section>}
    </>
  );
  const headerFields = (
    <>
      <label className="field">
        {t('نوع الترويسة', 'Header type')}
        <select
          value={format}
          onChange={(e) => {
            setFormat(e.target.value);
            setHeaderSample('');
            setFilePreview(undefined);
            setUploadError('');
          }}
        >
          <option value="NONE">{t('بدون ترويسة', 'No header')}</option>
          <option value="TEXT">{t('نص', 'Text')}</option>
          <option value="IMAGE" disabled={!uploadMedia && format !== 'IMAGE'}>
            {t('صورة', 'Image')}
          </option>
          <option value="VIDEO" disabled={!uploadMedia && format !== 'VIDEO'}>
            {t('فيديو', 'Video')}
          </option>
          <option value="DOCUMENT" disabled={!uploadMedia && format !== 'DOCUMENT'}>
            {t('مستند', 'Document')}
          </option>
        </select>
      </label>
      {format === 'TEXT' && (
        <label className="field">
          {t('نص الترويسة', 'Header text')}
          <input
            value={headerText}
            onChange={(e) => setHeaderText(e.target.value)}
            maxLength={60}
            required
          />
        </label>
      )}
      {format === 'TEXT' && headerText.includes('{{1}}') && (
        <label className="field">
          {t('مثال متغير الترويسة', 'Header variable example')}
          <input
            value={headerSample}
            onChange={(e) => setHeaderSample(e.target.value)}
            maxLength={500}
            required
          />
        </label>
      )}
      {format !== 'NONE' && format !== 'TEXT' && (
        <>
          {uploadMedia && (
            <label className="field">
              {t('رفع عينة الوسائط إلى Meta', 'Upload a media sample to Meta')}
              <input
                type="file"
                accept={
                  {
                    IMAGE: 'image/jpeg,image/png',
                    VIDEO: 'video/mp4',
                    DOCUMENT: 'application/pdf',
                  }[format]
                }
                required={!headerSample}
                onChange={async (e) => {
                  const input = e.currentTarget;
                  const file = input.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  setUploadError('');
                  try {
                    setHeaderSample(await uploadMedia(file, format));
                    setFilePreview(URL.createObjectURL(file));
                  } catch {
                    input.value = '';
                    setUploadError(
                      t(
                        'تعذّر رفع العينة إلى Meta. تحقق من نوع الملف وحجمه وصلاحيات الربط.',
                        'Meta upload failed. Check the file type, size and connection permissions.',
                      ),
                    );
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>
          )}
          {uploading && <p role="status">{t('جارٍ رفع العينة…', 'Uploading sample…')}</p>}
          {headerSample && (
            <p role="status">{t('عينة الوسائط جاهزة.', 'Media sample is ready.')}</p>
          )}
          {uploadError && <p role="alert">{uploadError}</p>}
        </>
      )}
      {!uploadMedia && (
        <p id={mediaHintId} className="muted">
          {t(
            'رفع عينة جديدة يتطلب اتصال Meta مفعّلًا لتلك القناة.',
            'A new sample requires an enabled Meta connection for this channel.',
          )}
        </p>
      )}
    </>
  );
  const footerField = (
    <>
      <label className="field">
        {t('تذييل اختياري', 'Optional footer')}
        <input value={footer} onChange={(e) => setFooter(e.target.value)} maxLength={60} />
      </label>
    </>
  );
  const buttonFields = (
    <>
      <fieldset className="stack">
        <legend>{t('الأزرار', 'Buttons')}</legend>
        <p className="muted">
          {t(
            'استخدم ردودًا سريعة أو أزرار روابط واتصال. رابط متغير ينتهي بـ {{1}} يحتاج مثال رابط كامل.',
            'Use quick replies or URL/phone actions. A dynamic URL ending in {{1}} needs a complete sample URL.',
          )}
        </p>
        {buttons.map((b, i) => (
          <div className={studio.buttonEditor} key={i}>
            <label className="field">
              {t('نوع الزر', 'Button type')} {i + 1}
              <select
                value={b.type}
                onChange={(e) =>
                  setButtons(
                    buttons.map((x, n) =>
                      n === i
                        ? {
                            type: e.target.value,
                            text: x.text,
                            ...(e.target.value === 'URL'
                              ? { url: '' }
                              : e.target.value === 'PHONE_NUMBER'
                                ? { phone_number: '' }
                                : {}),
                          }
                        : x,
                    ),
                  )
                }
              >
                <option value="QUICK_REPLY">{t('رد سريع', 'Quick reply')}</option>
                <option value="URL">{t('رابط', 'URL')}</option>
                <option value="PHONE_NUMBER">{t('اتصال', 'Phone')}</option>
              </select>
            </label>
            <label className="field">
              {t('عنوان الزر', 'Button label')} {i + 1}
              <input
                value={b.text}
                onChange={(e) => update(i, { text: e.target.value })}
                maxLength={25}
                required
              />
            </label>
            {b.type === 'URL' && (
              <>
                <label className="field">
                  {t('رابط الزر', 'Button URL')} {i + 1}
                  <input
                    value={b.url || ''}
                    onChange={(e) => {
                      const url = e.target.value;
                      update(i, { url, ...(!url.includes('{{1}}') ? { example: undefined } : {}) });
                    }}
                    maxLength={2000}
                    dir="ltr"
                    required
                  />
                </label>
                {b.url?.includes('{{1}}') && (
                  <label className="field">
                    {t('مثال رابط كامل', 'Complete sample URL')} {i + 1}
                    <input
                      type="url"
                      value={b.example?.[0] || ''}
                      onChange={(e) => update(i, { example: [e.target.value] })}
                      maxLength={2000}
                      dir="ltr"
                      required
                    />
                  </label>
                )}
              </>
            )}
            {b.type === 'PHONE_NUMBER' && (
              <label className="field">
                {t('رقم دولي', 'International phone')} {i + 1}
                <input
                  value={b.phone_number || ''}
                  onChange={(e) => update(i, { phone_number: e.target.value })}
                  pattern="\+[0-9]{6,15}"
                  dir="ltr"
                  required
                />
              </label>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => setButtons(buttons.filter((_, n) => n !== i))}
            >
              <NavIcon name="trash"/>{t('حذف الزر', 'Remove button')} {i + 1}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn"
          disabled={buttons.length >= 10}
          onClick={() => setButtons([...buttons, { type: 'QUICK_REPLY', text: '' }])}
        >
          <NavIcon name="plus"/>{t('إضافة زر', 'Add button')} · {buttons.length}/10
        </button>
      </fieldset>
    </>
  );
  const preview = (
    <section className={studio.chatPreview} aria-label={t('معاينة القالب', 'Template preview')}>
      <header className={studio.previewHeading}><span><NavIcon name="whatsapp"/></span><div><h2>{t('معاينة واتساب','WhatsApp preview')}</h2><small>{t('معاينة مباشرة • بيانات تجريبية','Live preview • sample data')}</small></div></header>
      <div className={studio.chatBubble} dir="auto">
        {format === 'TEXT' && (
          <strong>{headerText.replace('{{1}}', () => headerSample || '{{1}}')}</strong>
        )}
        {format !== 'NONE' && format !== 'TEXT' && (
          <div className={studio.mediaTile}>
            {filePreview && format === 'IMAGE' && (
              <img src={filePreview} alt={t('عينة الترويسة', 'Header sample')} />
            )}
            {filePreview && format === 'VIDEO' && <video controls src={filePreview} />}
            {
              {
                IMAGE: t('صورة', 'Image'),
                VIDEO: t('فيديو', 'Video'),
                DOCUMENT: t('مستند', 'Document'),
              }[format]
            }
          </div>
        )}
        <p>
          {body.replace(
            /\{\{(\d+)\}\}/g,
            (token, index) => samples[Number(index) - 1]?.trim() || token,
          ) || t('معاينة النص هتظهر هنا.', 'Your message preview will appear here.')}
        </p>
        {footer && <small>{footer}</small>}
        {buttons.map((button, i) => (
          <span className={studio.chatButton} key={i}>
            <NavIcon name={button.type==='URL'?'globe':button.type==='PHONE_NUMBER'?'phone':'chat'}/>{button.text || t('زر', 'Button')}
          </span>
        ))}
      </div>
    </section>
  );
  return (
    <form
      className={studio.draft}
      onInvalidCapture={(e) => {
        if (e.target instanceof HTMLElement) {
          const details = e.target.closest('details');
          if (details) details.open = true;
        }
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || uploading) return;
        if (step === 1 && (!numbered || !body.trim())) {
          setDesignError(
            !numbered
              ? t(
                  'رتّب المتغيرات في النص بدءًا من {{1}} ثم {{2}} بدون تخطي رقم.',
                  'Use consecutive variables in order, starting with {{1}} then {{2}}.',
                )
              : t('اكتب نص الرسالة.', 'Enter the message text.'),
          );
          return;
        }
        setDesignError('');
        if (step < 2) {
          setStep(step + 1);
          return;
        }
        const review = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'review';
        const persist = review && saveAndReview ? saveAndReview : save;
        await persist({
          name,
          language,
          category,
          body,
          examples: tokens.map((_, index) => samples[index]?.trim() || ''),
          ...(format !== 'NONE'
            ? {
                header: {
                  type: 'HEADER',
                  format,
                  ...(format === 'TEXT'
                    ? {
                        text: headerText,
                        ...(headerText.includes('{{1}}')
                          ? { example: { header_text: [headerSample] } }
                          : {}),
                      }
                    : { example: { header_handle: [headerSample] } }),
                },
              }
            : {}),
          ...(footer ? { footer } : {}),
          buttons,
        });
      }}
    >
      <fieldset disabled={busy || uploading} className={studio.draftLayout}>
        <h1><NavIcon name={initial?'edit':'plus'}/>
          {initial
            ? t('تعديل مسودة القالب', 'Edit template draft')
            : t('قالب واتساب جديد', 'New WhatsApp template')}
        </h1>
        <ol className={studio.wizardSteps}>
          {steps.map((label, index) => (
            <li key={label} aria-current={step === index ? 'step' : undefined}>
              {index < step ? (
                <button type="button" onClick={() => setStep(index)}>
                  <NavIcon name="circleCheck"/>{label}
                </button>
              ) : (
                <span><bdi>{index+1}</bdi>{label}</span>
              )}
            </li>
          ))}
        </ol>
        <div className={studio.draftWorkspace}>
          <div className={studio.draftInput}>
            <h2>{steps[step]}</h2>
            {step === 0 && basicFields}
            {step === 1 && (
              <>
                {contentFields}
                {designError && <p role="alert">{designError}</p>}
                <details
                  className={studio.draftOptions}
                  open={optionsOpen} onToggle={e=>setOptionsOpen(e.currentTarget.open)}
                >
                  <summary><NavIcon name="settings"/>{t('ترويسة وتذييل وأزرار', 'Header, footer and buttons')}</summary>
                  <div className="stack">
                    {headerFields}
                    {footerField}
                    {buttonFields}
                  </div>
                </details>
              </>
            )}
            {step === 2 && (
              <section className={studio.reviewPanel}><h3><NavIcon name="shield"/>{t('مراجعة بيانات القالب','Review template details')}</h3><dl>{[[t('اسم القالب','Template name'),name],[t('اللغة','Language'),language],[t('التصنيف','Category'),category==='UTILITY'?t('خدمي','Utility'):t('تسويقي','Marketing')],[t('المتغيرات','Variables'),String(tokens.length)],[t('الأزرار','Buttons'),String(buttons.length)],[t('الترويسة','Header'),format==='NONE'?t('بدون','None'):format]].map(([label,value])=><div key={label}><dt>{label}</dt><dd><bdi>{value}</bdi></dd></div>)}</dl><p className={studio.reviewHint}><NavIcon name="circleCheck"/>{t('حفظ المسودة لا يرسل رسالة إلى العملاء. تقديم القالب للموافقة يتطلب تأكيدًا منفصلًا ومراجعة Meta.','Saving a draft does not message customers. Submission requires separate confirmation and Meta review.')}</p><button type="button" className="btn" onClick={()=>setStep(1)}><NavIcon name="edit"/>{t('تعديل الرسالة','Edit message')}</button></section>
            )}
          </div>
          <aside className={studio.draftPreview}>{preview}</aside>
        </div>
        <div className={studio.draftActions}>
          <div className="flex flex-wrap gap-2">
            {step > 0 && (
              <button type="button" className="btn" onClick={() => setStep(step - 1)}>
                <NavIcon name="chevron"/>{t('السابق', 'Back')}
              </button>
            )}
            {step < 2 ? (
              <button className="btn btn-primary">{t('التالي', 'Next')}<NavIcon name="chevron"/></button>
            ) : (
              <>
                <button className="btn btn-primary">
                  <NavIcon name="check"/>{busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ المسودة', 'Save draft')}
                </button>
                {saveAndReview && (
                  <button type="submit" name="intent" value="review" className="btn">
                    <NavIcon name="delivery"/>{t('حفظ ثم مراجعة التقديم', 'Save and review submission')}
                  </button>
                )}
              </>
            )}
            {cancel && (
              <button type="button" className="btn" onClick={cancel}>
                {t('إلغاء', 'Cancel')}
              </button>
            )}
          </div>
        </div>
      </fieldset>
    </form>
  );
}
