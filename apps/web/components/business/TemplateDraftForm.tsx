'use client';
import { useId, useState, type ReactNode } from 'react';
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
    example?: Header['example'];
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
  mode = 'default',
  saveAndReview,
}: {
  mode?: 'default' | 'manager';
  initial?: TemplateRow;
  busy: boolean;
  save: (draft: unknown) => Promise<boolean>;
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
  const [footer, setFooter] = useState(
    initial?.components.find((c) => c.type === 'FOOTER')?.text || '',
  );
  const [buttons, setButtons] = useState<DraftButton[]>(
    initial?.components.find((c) => c.type === 'BUTTONS')?.buttons || [],
  );
  function update(index: number, next: Partial<DraftButton>) {
    setButtons(buttons.map((b, i) => (i === index ? { ...b, ...next } : b)));
  }
  const manager = mode === 'manager';
  const basicFields = (
    <>
      <div className={manager ? 'form-grid' : studio.defaultLayout}>
        <label className="field">
          {manager
            ? t('اسم القالب', 'Template Name')
            : t('معرّف إنجليزي صغير', 'Lowercase identifier')}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            pattern="[a-z0-9_]+"
            maxLength={512}
            required
            dir="ltr"
          />
        </label>
        <label className="field">
          {t('اللغة', 'Language')}
          {manager ? (
            <select value={language} onChange={(e) => setLanguage(e.target.value)} required>
              {!templateLocales.some(([code]) => code === language) && (
                <option value={language}>{language}</option>
              )}
              {templateLocales.map(([code, label]) => (
                <option key={code} value={code}>
                  {uiLanguage === 'ar'
                    ? new Intl.DisplayNames(['ar'], { type: 'language' }).of(
                        code.replace('_', '-'),
                      ) || label
                    : label}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                pattern="[a-z]{2,3}(_[A-Z]{2})?"
                required
                dir="ltr"
              />
            </>
          )}
        </label>
      </div>
    </>
  );
  const categoryField = manager ? (
    <>
      <fieldset className={studio.choices} aria-label={t('تصنيف القالب', 'Template Category')}>
        {['UTILITY', 'MARKETING'].map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="templateCategory"
              value={value}
              checked={category === value}
              onChange={() => setCategory(value)}
            />
            {value === 'UTILITY' ? t('خدمي', 'Utility') : t('تسويقي', 'Marketing')}
          </label>
        ))}
      </fieldset>
      <p className={studio.unavailable}>
        {t(
          'قوالب المصادقة وOTP غير مدعومة حاليًا.',
          'Authentication and OTP templates are not currently supported.',
        )}
      </p>
    </>
  ) : (
    <>
      <label className="field">
        {t('التصنيف', 'Category')}
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="UTILITY">{t('خدمي', 'Utility')}</option>
          <option value="MARKETING">{t('تسويقي', 'Marketing')}</option>
        </select>
      </label>
    </>
  );
  const contentFields = (
    <>
      <label className="field">
        {t('النص: المتغيرات بالشكل {{1}}', 'Text: variables use {{1}}')}
        <textarea
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1024}
          rows={4}
        />
      </label>
      <label className="field">
        {t('مثال لكل متغير، سطر لكل مثال', 'One example per variable, one per line')}
        <textarea value={examples} onChange={(e) => setExamples(e.target.value)} rows={3} />
      </label>
    </>
  );
  const headerFields = (
    <>
      {manager ? (
        <fieldset
          className={`${studio.choices} ${studio.headerChoices}`}
          aria-label={t('نوع الترويسة', 'Header Type')}
        >
          {(['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="templateHeader"
                value={value}
                checked={format === value}
                onChange={() => {
                  setFormat(value);
                  setHeaderSample('');
                }}
              />
              {
                {
                  NONE: t('بدون', 'None'),
                  TEXT: t('نص', 'Text'),
                  IMAGE: t('صورة', 'Image'),
                  VIDEO: t('فيديو', 'Video'),
                  DOCUMENT: t('مستند', 'Document'),
                }[value]
              }
            </label>
          ))}
        </fieldset>
      ) : (
        <>
          <label className="field">
            {t('نوع الترويسة', 'Header type')}
            <select
              value={format}
              onChange={(e) => {
                setFormat(e.target.value);
                setHeaderSample('');
              }}
            >
              <option value="NONE">{t('بدون ترويسة', 'No header')}</option>
              <option value="TEXT">{t('نص', 'Text')}</option>
              <option value="IMAGE">{t('صورة', 'Image')}</option>
              <option value="VIDEO">{t('فيديو', 'Video')}</option>
              <option value="DOCUMENT">{t('مستند', 'Document')}</option>
            </select>
          </label>
        </>
      )}
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
      {format !== 'NONE' && (format !== 'TEXT' || headerText.includes('{{1}}')) && (
        <label className="field">
          {format === 'TEXT'
            ? t('مثال متغير الترويسة', 'Header variable example')
            : t('معرّف رفع عينة الوسائط من Meta', 'Meta sample media upload handle')}
          <input
            aria-label={
              format === 'TEXT'
                ? t('مثال متغير الترويسة', 'Header variable example')
                : t('معرّف رفع عينة الوسائط من Meta', 'Meta sample media upload handle')
            }
            aria-describedby={format !== 'TEXT' ? mediaHintId : undefined}
            value={headerSample}
            onChange={(e) => setHeaderSample(e.target.value)}
            maxLength={4096}
            required
          />
          {format !== 'TEXT' && (
            <span className="muted" id={mediaHintId}>
              {t(
                'استخدم معرّف عينة من رفع Meta القابل للاستئناف، وليس رابط إرسال الوسائط. يلزم حساب خارجي للحصول عليه.',
                'Use a sample handle from Meta resumable upload, rather than a message media URL. Obtaining it requires your external account.',
              )}
            </span>
          )}
        </label>
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
          <div className="card stack" key={i}>
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
              {t('حذف الزر', 'Remove button')} {i + 1}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn"
          disabled={buttons.length >= 10}
          onClick={() => setButtons([...buttons, { type: 'QUICK_REPLY', text: '' }])}
        >
          {t('إضافة زر', 'Add button')}
        </button>
      </fieldset>
    </>
  );
  const previewFields = (
    <>
      <section className="card stack" aria-label={t('معاينة القالب', 'Template preview')}>
        <h3>{t('معاينة البنية', 'Structure preview')}</h3>
        {format === 'TEXT' ? (
          <strong>{headerText}</strong>
        ) : (
          format !== 'NONE' && (
            <p>
              {t('ترويسة وسائط', 'Media header')} · {format}
            </p>
          )
        )}
        <p className="whitespace-pre-wrap">{body}</p>
        {footer && <small>{footer}</small>}
        <div className="flex flex-wrap gap-2">
          {buttons.map((b, i) => (
            <span className="badge" key={i}>
              {b.text || t('زر', 'Button')}
            </span>
          ))}
        </div>
      </section>
    </>
  );
  const actionFields = (
    <>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ المسودة', 'Save draft')}
        </button>
        {manager && saveAndReview && (
          <button type="submit" name="intent" value="review" className="btn" disabled={busy}>
            {t('حفظ / تقديم القالب', 'Save / Submit Template')}
          </button>
        )}
        {cancel && (
          <button type="button" className="btn" onClick={cancel} disabled={busy}>
            {t('إلغاء التعديل', 'Cancel editing')}
          </button>
        )}
      </div>
    </>
  );
  const card = (title: string, description: string, children: ReactNode) => (
    <section className={studio.card}>
      <h3>{title}</h3>
      <p className={studio.description}>{description}</p>
      {children}
    </section>
  );
  return (
    <form
      className={manager ? studio.form : 'card stack'}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const review = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'review';
        const persist = review && saveAndReview ? saveAndReview : save;
        await persist({
          name,
          language,
          category,
          body,
          examples: examples.split('\n').filter(Boolean),
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
      <fieldset disabled={busy} className={manager ? studio.layout : studio.defaultLayout}>
        {manager ? (
          <>
            <div className={studio.main}>
              {card(
                t('المعلومات الأساسية', 'Basic Information'),
                t(
                  'سمّ القالب واختر اللغة المستهدفة.',
                  'Give your template a name and choose the target locale.',
                ),
                basicFields,
              )}
              {card(
                t('تصنيف القالب', 'Template Category'),
                t('اختر التصنيف المناسب لرسالتك.', 'Choose the best category for your message.'),
                categoryField,
              )}
              {card(
                t('نوع الترويسة', 'Header Type'),
                t('أضف ترويسة إلى القالب (اختياري).', 'Add a header to your template (optional).'),
                headerFields,
              )}
              {card(
                t('محتوى الرسالة', 'Message Content'),
                t('اكتب رسالتك باستخدام المتغيرات.', 'Write your message using variables.'),
                contentFields,
              )}
              {card(
                t('نص التذييل (اختياري)', 'Footer Text (Optional)'),
                t(
                  'أضف معلومات في نهاية الرسالة.',
                  'Add additional information at the end of your message.',
                ),
                footerField,
              )}
              {card(
                t('الأزرار (اختياري)', 'Buttons (Optional)'),
                t('أضف أزرارًا تفاعلية إلى القالب.', 'Add interactive buttons to your template.'),
                buttonFields,
              )}
              <div className={studio.actions}>{actionFields}</div>
            </div>
            <aside className={studio.preview}>
              <h3>{t('معاينة مباشرة', 'Live Preview')}</h3>
              <p className={studio.description}>
                {t(
                  'هكذا يظهر محتوى الرسالة. قد يختلف العرض حسب الجهاز.',
                  'This is how your message content appears. Actual appearance may vary across devices.',
                )}
              </p>
              {previewFields}
            </aside>
          </>
        ) : (
          <>
            <h2>
              {initial
                ? t('تعديل مسودة القالب', 'Edit template draft')
                : t('مسودة قالب جديد', 'New template draft')}
            </h2>
            <div className="form-grid">
              {basicFields}
              {categoryField}
            </div>
            {contentFields}
            {headerFields}
            {footerField}
            {buttonFields}
            {previewFields}
            {actionFields}
          </>
        )}
      </fieldset>
    </form>
  );
}
