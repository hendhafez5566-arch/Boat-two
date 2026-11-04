'use client';
import { DisclosureSummary } from '../product/DisclosureSummary';

import { useState } from 'react';
import { api } from '../../lib/api';
import { useData } from './useData';
import { useLocale } from '../product/locale';
import { NavIcon } from '../product/NavIcon';
import css from './sales.module.css';
import styles from './crm-workspace.module.css';
type Signals = {
  recentDays: number;
  recentPoints: number;
  interactionsRequired: number;
  interactionPoints: number;
  inactivePoints: number;
  interestField: string;
  interestValue: string;
  interestPoints: number;
  lostPoints: number;
  hotAt: number;
  warmAt: number;
};
export function SalesScoringSignals() {
  const { t } = useLocale(),
    data = useData<Signals | null>('/crm/sales/scoring-signals', null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const labels: Record<string, [string, string]> = {
    recentDays: ['فترة التفاعل (أيام)', 'Interaction window (days)'],
    recentPoints: ['نقاط التواصل الحديث', 'Recent contact points'],
    interactionsRequired: ['عدد رسائل العميل المطلوبة', 'Required inbound messages'],
    interactionPoints: ['نقاط بلوغ عدد التفاعلات', 'Interaction threshold points'],
    inactivePoints: ['خصم عند غياب التواصل', 'Inactivity deduction'],
    interestField: ['مفتاح حقل الاهتمام', 'Interest field key'],
    interestValue: ['إجابة الاهتمام المطابقة', 'Matching interest answer'],
    interestPoints: ['نقاط إجابة الاهتمام', 'Interest answer points'],
    lostPoints: ['خصم عند وجود صفقة خاسرة', 'Lost deal deduction'],
    hotAt: ['حد الاهتمام المرتفع', 'Hot threshold'],
    warmAt: ['حد الاهتمام المتوسط', 'Warm threshold'],
  };
  return (
    <details className={styles.card}>
      <DisclosureSummary>
        <h2>
          <NavIcon name="temperature" />
          {t('إشارات التقييم الذكي', 'Smart scoring signals')}
        </h2>
      </DisclosureSummary>
      <p>
        {t(
          'تُضاف إلى نقاط V2. القيم الافتراضية صفر للحفاظ على التقييم المعتمد. التفاعلات هي رسائل العميل غير الداخلية خلال الفترة.',
          'Added to V2 points. Default weights are zero to preserve existing scores. Interactions count non-internal inbound messages in the selected window.',
        )}
      </p>
      {data.error && <p role="alert">{data.error}</p>}
      {data.data && (
        <form
          className={`${styles.form} ${css.fields}`}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage('');
            const form = new FormData(e.currentTarget),
              rules = Object.fromEntries(
                Object.keys(data.data!).map((key) => [
                  key,
                  key === 'interestField' || key === 'interestValue'
                    ? String(form.get(key) || '')
                    : Number(form.get(key)),
                ]),
              );
            try {
              await api('/crm/sales/scoring-signals', {
                method: 'POST',
                body: JSON.stringify({ rules, expected: data.data }),
              });
              await data.reload();
              setMessage(t('حُفظت إشارات التقييم.', 'Scoring signals saved.'));
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {Object.entries(labels).map(([key, label]) => (
            <label key={key}>
              {t(...label)}
              <input
                required={!['interestField', 'interestValue'].includes(key)}
                name={key}
                type={key === 'interestField' || key === 'interestValue' ? 'text' : 'number'}
                min={key.endsWith('Points') ? -100 : 0}
                max={key === 'recentDays' ? 365 : key === 'interactionsRequired' ? 1000 : 100}
                defaultValue={data.data![key as keyof Signals]}
              />
            </label>
          ))}
          <button className="btn btn-primary" disabled={busy}>
            {t('حفظ إشارات التقييم', 'Save scoring signals')}
          </button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
