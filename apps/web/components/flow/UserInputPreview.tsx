'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useLocale } from '../product/locale';

export type UIQuestion = {
  id: string;
  text: string;
  kind: 'choice' | 'text' | 'number' | 'email' | 'phone';
  options?: { id: string; title: string }[];
  saveAs: string;
  allowSkip?: boolean;
  skipText?: string;
  errorText?: string;
  retries?: number;
};

/** معاينة السلسلة بشكل الكروت: User Input Flow → New Question … → Text (رسالة الشكر) */
export default function UserInputPreview({
  name,
  questions,
  doneText,
  stats,
}: {
  name?: string;
  questions: UIQuestion[];
  doneText?: string;
  stats?: { sent: number; delivered: number; subscribers: number; errors: number };
}) {
  const { t } = useLocale();
  const s = stats ?? { sent: 0, delivered: 0, subscribers: 0, errors: 0 };
  const Stats = () => (
    <div className="ui-stats">
      <span>✈ {t('أُرسلت', 'Sent')}<b>{s.sent}</b></span>
      <span>✓ {t('وصلت', 'Delivered')}<b>{s.delivered}</b></span>
      <span>◉ {t('مشتركون', 'Subscribers')}<b>{s.subscribers}</b></span>
      <span className={s.errors ? 'is-err' : ''}>⚠ {t('أخطاء', 'Errors')}<b>{s.errors}</b></span>
    </div>
  );
  return (
    <div className="ui-chain" role="list" aria-label={t('سلسلة الأسئلة', 'Question chain')}>
      <div className="ui-card ui-start" role="listitem">
        <h4>☰ {t('تدفق إدخال المستخدم', 'User Input Flow')}</h4>
        <Stats />
        <div className="ui-field"><small>{t('اسم الحملة', 'Campaign name')}</small>{name || '—'}</div>
        <div className="ui-ports"><span>{t('رد', 'Reply')}</span><span>{t('أول سؤال', 'First Question')}</span></div>
      </div>
      {questions.map((q, i) => (
        <div className="ui-card" role="listitem" key={q.id}>
          <h4>
            ❓ {t('سؤال جديد', 'New Question')} <small>{i + 1}</small>
          </h4>
          <Stats />
          <div className="ui-tag">{q.kind === 'choice' ? t('اختيار متعدد', 'Multiple Choice') : t('نص حر', 'Free input')}</div>
          <div className="ui-body">
            <p>{q.text || t('(بدون نص)', '(no text)')}</p>
            {q.kind === 'choice' &&
              (q.options ?? []).map((o) => (
                <label key={o.id} className="ui-opt"><i aria-hidden />{o.title}</label>
              ))}
          </div>
          <div className="ui-field">
            <small>{t('نوع الرد', 'Reply type')}</small>
            {q.kind === 'choice' ? t('نص', 'Text') : q.kind}
            <small>{t('حفظ في حقل مخصص', 'Save to custom field')}</small>
            <code>{q.saveAs || '—'}</code>
          </div>
          <div className="ui-ports">
            <span>{t('سؤال', 'Question')}</span>
            <span>{i + 1 < questions.length ? t('السؤال التالي', 'Next Question') : t('رسالة الشكر', 'Thankyou Message')}</span>
          </div>
        </div>
      ))}
      <div className="ui-card" role="listitem">
        <h4>☰ {t('نص', 'Text')}</h4>
        <Stats />
        <div className="ui-body"><p>{doneText || t('(بدون رسالة شكر)', '(no thank-you message)')}</p></div>
        <div className="ui-ports"><span>{t('رسالة', 'Message')}</span><span>{t('الخطوة التالية', 'Compose Next Message')} ○</span></div>
      </div>
    </div>
  );
}
