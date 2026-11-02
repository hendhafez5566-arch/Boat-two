'use client';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useData } from './useData';
import { useLocale } from '../product/locale';
import { NavIcon } from '../product/NavIcon';
import styles from './crm-workspace.module.css';
type Rules = {
  qualified: number;
  email: number;
  phone: number;
  openDeal: number;
  interestTag: string;
  tag: number;
};
export function CrmScore({ contactId, version }: { contactId: string; version: string }) {
  const { t } = useLocale();
  const d = useData<{
    score: number;
    band: string;
    calculatedAt: string;
    reasons: { key: string; points: number }[];
  } | null>('/crm/workspace/score/' + contactId + '?version=' + encodeURIComponent(version), null);
  const labels: Record<string, string> = {
    qualified: t('عميل مؤهل', 'Qualified lead'),
    email: t('بريد مسجل', 'Email recorded'),
    phone: t('هاتف مسجل', 'Phone recorded'),
    openDeal: t('فرصة مفتوحة', 'Open opportunity'),
    tag: t('وسم الاهتمام', 'Interest tag'),
    recent: t('تواصل حديث', 'Recent contact'),
    interactions: t('تفاعلات خلال الفترة', 'Interactions in window'),
    inactive: t('لا تواصل خلال الفترة', 'No recent contact'),
    botInterest: t('إجابة اهتمام مسجلة', 'Recorded interest answer'),
    lost: t('صفقة خاسرة', 'Lost deal'),
  };
  return (
    <div className={styles.insight}>
      <NavIcon name="temperature" />
      <span>{t('درجة الاهتمام بالقواعد', 'Rule-based interest score')}</span>
      <strong>{d.loading ? '…' : d.data ? d.data.score + '/100' : '—'}</strong>
      {d.data && (
        <span>
          {d.data.band === 'hot'
            ? t('اهتمام مرتفع', 'Hot')
            : d.data.band === 'warm'
              ? t('اهتمام متوسط', 'Warm')
              : t('اهتمام منخفض', 'Cold')}
        </span>
      )}
      {d.error && <span role="alert">{t('تعذر تحميل التقييم', 'Could not load score')}</span>}
      <details>
        <summary>{t('لماذا هذا التقييم؟', 'Why this score?')}</summary>
        <p>
          {t(
            'مجموع نقاط قواعد شركتك، بحد أقصى100. ليس توقعًا لاحتمال البيع.',
            'Sum of workspace rule points, capped at100. Not a prediction of sale probability.',
          )}
        </p>
        {d.data?.reasons.map((r) => (
          <p key={r.key}>
            {labels[r.key] || r.key}: {r.points > 0 ? '+' : ''}
            {r.points}
          </p>
        ))}
        {d.data?.calculatedAt && (
          <small>
            {t('حُسب الآن: ', 'Calculated: ')}
            {new Date(d.data.calculatedAt).toLocaleString()}
          </small>
        )}
        {d.data && !d.data.reasons.length && (
          <p>{t('لا توجد قواعد منطبقة بعد.', 'No matching rules yet.')}</p>
        )}
      </details>
    </div>
  );
}
export function CrmScoring() {
  const { t } = useLocale();
  const data = useData<{ rules: Rules } | null>('/crm/workspace/scoring', null);
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const labels: Record<string, string> = {
    qualified: t('عميل مؤهل', 'Qualified lead'),
    email: t('بريد مسجل', 'Email recorded'),
    phone: t('هاتف مسجل', 'Phone recorded'),
    openDeal: t('فرصة مفتوحة', 'Open opportunity'),
    tag: t('وجود وسم الاهتمام', 'Interest tag present'),
  };
  return (
    <section className={styles.panel}>
      <h2>
        <NavIcon name="temperature" />
        {t('قواعد تقييم الاهتمام', 'Interest scoring rules')}
      </h2>
      <p className={styles.hint}>
        {t(
          'تقييم واضح وقابل للتفسير. لا يرسل رسائل ولا يغير بيانات العميل.',
          'Transparent and explainable. No messages sent or customer data changed.',
        )}
      </p>
      {data.error && <p role="alert">{data.error}</p>}
      {data.data && (
        <form
          className={styles.form}
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setBusy(true);
            setMessage('');
            try {
              const rules = Object.fromEntries(
                Object.keys(data.data!.rules).map((k) => [
                  k,
                  k === 'interestTag' ? String(form.get(k) || '') : Number(form.get(k)),
                ]),
              );
              await api('/crm/workspace/scoring', {
                method: 'POST',
                body: JSON.stringify({ rules, expected: data.data!.rules }),
              });
              setMessage(t('حُفظت قواعد التقييم', 'Scoring rules saved'));
              await data.reload();
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className={styles.grid}>
            {Object.entries(labels).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  name={key}
                  min="0"
                  max="100"
                  required
                  defaultValue={data.data!.rules[key as keyof Rules]}
                />
              </label>
            ))}
          </div>
          <label>
            {t('وسم الاهتمام', 'Interest tag')}
            <input name="interestTag" maxLength={50} defaultValue={data.data.rules.interestTag} />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            <NavIcon name="check" />
            {t('حفظ القواعد', 'Save rules')}
          </button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
