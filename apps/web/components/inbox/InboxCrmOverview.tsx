'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useData } from '../business/useData';
import { useLocale } from '../product/locale';
import { NavIcon } from '../product/NavIcon';
import styles from './inbox-customer-panel.module.css';
type Pipeline = { id: string; name: string; stages: string[] };
type Form = {
  contactVersion: string;
  dealId: string | null;
  dealVersion: string | null;
  pipelineId: string;
  stage: string;
  title: string;
  value: string;
  currency: string;
  expectedClose: string;
  ownerId: string;
  score: string;
  source: string;
};
const currencies =
  'USD EUR GBP CHF JPY CNY AUD CAD NZD BDT INR PKR NPR LKR MYR SGD IDR THB PHP VND HKD KRW SAR AED QAR KWD BHD OMR JOD IQD LBP EGP RUB TRY PLN SEK NOK DKK CZK HUF RON UAH KZT UZS ZAR NGN KES GHS MAD TND AFN BRL MXN'.split(
    ' ',
  );
export function InboxCrmOverview({
  contact,
  deals,
  team,
  canManage,
  onSaved,
}: {
  contact: any;
  deals: any[];
  team: any[];
  canManage: boolean;
  onSaved: () => Promise<void>;
}) {
  const { t, language } = useLocale();
  const pipelines = useData<Pipeline[]>(canManage ? '/crm/pipelines' : null, []);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const deal = deals.find((row) => row.status === 'open');
  const scoreText = (score: string | number | null | undefined) => {
    const labels: Record<string, string> = {
      hot: t('مهتم جدًا', 'Hot'),
      warm: t('مهتم', 'Warm'),
      cold: t('اهتمام منخفض', 'Cold'),
    };
    return labels[String(score)] ?? score ?? '—';
  };
  const date = (value: string) => {
    if (!value) return '—';
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US');
  };
  function edit() {
    if (!contact || pipelines.loading) return;
    const pipeline =
      pipelines.data.find((row) => row.id === deal?.pipeline_id) || pipelines.data[0];
    setForm({
      contactVersion: contact.updated_at,
      dealId: deal?.id || null,
      dealVersion: deal?.updated_at || null,
      pipelineId: pipeline?.id || '',
      stage: deal?.stage || pipeline?.stages[0] || '',
      title: deal?.title || contact.name || '',
      value: String(Number(deal?.value_cents || 0) / 100),
      currency: deal?.currency || 'USD',
      expectedClose: deal?.expected_close ? String(deal.expected_close).slice(0, 10) : '',
      ownerId: deal?.owner_id || '',
      score: contact.attributes?.lead_score == null ? '' : String(contact.attributes.lead_score),
      source: String(contact.attributes?.source ?? ''),
    });
    setError('');
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || lock.current) return;
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(form.value);
    const cents = match ? Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')) : NaN;
    if (form.pipelineId && (!Number.isSafeInteger(cents) || cents < 0 || cents > 100000000000)) {
      setError(
        t(
          'أدخل قيمة صحيحة بمنزلتين عشريتين بحد أقصى.',
          'Enter a valid amount with at most two decimal places.',
        ),
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await api(`/crm/contacts/${contact.id}/overview`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedContactUpdatedAt: form.contactVersion,
          expectedDealId: form.dealId,
          expectedDealUpdatedAt: form.dealVersion,
          leadScore:
            form.score === ''
              ? null
              : ['hot', 'warm', 'cold'].includes(form.score)
                ? form.score
                : Number(form.score),
          source: form.source.trim() || null,
          deal: form.pipelineId
            ? {
                pipelineId: form.pipelineId,
                stage: form.stage,
                title: form.title,
                valueCents: cents,
                currency: form.currency,
                expectedClose: form.expectedClose || null,
                ownerId: form.ownerId || null,
              }
            : null,
        }),
      });
      await onSaved();
      setForm(null);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const set = (key: keyof Form, value: string) =>
    setForm((current) => (current ? { ...current, [key]: value } : null));
  return (
    <section className={`${styles.card} ${styles.crmCard}`}>
      <h3>
        {t('نظرة عامة على CRM', 'CRM Overview')}
        <span className={styles.crmHeaderActions}>
          <Link
            href={`/dashboard/crm?contact=${contact?.id || ''}`}
            aria-label={t('فتح CRM', 'Open CRM')}
          >
            <NavIcon name="departments" />
          </Link>
          {canManage && (
            <button
              type="button"
              className={styles.inlineEdit}
              disabled={!contact || pipelines.loading || busy}
              onClick={edit}
            >
              <NavIcon name="edit" />
              {t('تعديل', 'Edit')}
            </button>
          )}
        </span>
      </h3>
      {error && (
        <p className={styles.crmError} role="alert">
          {error}
        </p>
      )}
      {form ? (
        <form className={styles.crmEditor} onSubmit={save}>
          {pipelines.error && <p role="alert">{pipelines.error}</p>}
          <label>
            {t('مسار المبيعات', 'Pipeline')}
            <select
              value={form.pipelineId}
              disabled={busy}
              onChange={(event) => {
                const pipeline = pipelines.data.find((row) => row.id === event.target.value);
                setForm({
                  ...form,
                  pipelineId: pipeline?.id || '',
                  stage: pipeline?.stages[0] || '',
                });
              }}
            >
              {!pipelines.data.length && (
                <option value="">{t('لا توجد مسارات مبيعات', 'No pipelines available')}</option>
              )}
              {pipelines.data.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('المرحلة', 'Stage')}
            <select
              required={!!form.pipelineId}
              value={form.stage}
              disabled={busy || !form.pipelineId}
              onChange={(event) => set('stage', event.target.value)}
            >
              {(pipelines.data.find((row) => row.id === form.pipelineId)?.stages || []).map(
                (stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            {t('الصفقة النشطة', 'Active Deal')}
            <input
              required={!!form.pipelineId}
              maxLength={200}
              value={form.title}
              disabled={busy || !form.pipelineId}
              onChange={(event) => set('title', event.target.value)}
            />
          </label>
          <label>
            {t('قيمة الصفقة', 'Deal Value')}
            <span className={styles.moneyField}>
              <input
                aria-label={t('قيمة الصفقة', 'Deal Value')}
                type="number"
                step="0.01"
                min="0"
                max="1000000000"
                required={!!form.pipelineId}
                value={form.value}
                disabled={busy || !form.pipelineId}
                onChange={(event) => set('value', event.target.value)}
              />
              <select
                aria-label={t('العملة', 'Currency')}
                value={form.currency}
                disabled={busy || !form.pipelineId}
                onChange={(event) => set('currency', event.target.value)}
              >
                {[...new Set([...currencies, form.currency])].map((currency) => (
                  <option key={currency}>{currency}</option>
                ))}
              </select>
            </span>
          </label>
          <label>
            {t('الإغلاق المتوقع', 'Expected Close')}
            <input
              type="date"
              value={form.expectedClose}
              disabled={busy || !form.pipelineId}
              onChange={(event) => set('expectedClose', event.target.value)}
            />
          </label>
          <label>
            {t('مسؤول الصفقة', 'Deal Owner')}
            <select
              value={form.ownerId}
              disabled={busy || !form.pipelineId}
              onChange={(event) => set('ownerId', event.target.value)}
            >
              <option value="">{t('غير معيّن', 'Unassigned')}</option>
              {team.map((row) => (
                <option key={row.user_id} value={row.user_id}>
                  {row.full_name || row.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('درجة العميل', 'Lead Score')}
            <select
              value={form.score}
              disabled={busy}
              onChange={(event) => set('score', event.target.value)}
            >
              <option value="">{t('اختر', 'Select')}</option>
              {['hot', 'warm', 'cold'].map((value) => (
                <option key={value} value={value}>
                  {scoreText(value)}
                </option>
              ))}
              {form.score && !['hot', 'warm', 'cold'].includes(form.score) && (
                <option value={form.score}>{form.score}</option>
              )}
            </select>
          </label>
          <label>
            {t('المصدر', 'Source')}
            <input
              value={form.source}
              maxLength={200}
              disabled={busy}
              onChange={(event) => set('source', event.target.value)}
            />
          </label>
          <footer>
            <button
              type="button"
              className={styles.secondary}
              disabled={busy}
              onClick={() => {
                setForm(null);
                setError('');
              }}
            >
              {t('إلغاء', 'Cancel')}
            </button>
            <button className="btn btn-primary" disabled={busy || !!pipelines.error}>
              {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}
            </button>
          </footer>
        </form>
      ) : (
        <dl className={styles.facts}>
          {[
            [t('مسار المبيعات', 'Pipeline'), deal?.pipeline_name, 'flows'],
            [t('المرحلة', 'Stage'), deal?.stage, 'flag'],
            [
              t('الصفقة النشطة', 'Active Deal'),
              deal?.title || t('لا توجد صفقة نشطة', 'No active deal'),
              'handshake',
            ],
            [
              t('قيمة الصفقة', 'Deal Value'),
              deal ? `${Number(deal.value_cents || 0) / 100} ${deal.currency}` : '—',
              'coins',
            ],
            [t('الإغلاق المتوقع', 'Expected Close'), date(deal?.expected_close), 'calendar'],
            [
              t('مسؤول الصفقة', 'Deal Owner'),
              team.find((row) => row.user_id === deal?.owner_id)?.full_name,
              'user',
            ],
            [
              t('درجة العميل', 'Lead Score'),
              scoreText(contact?.attributes?.lead_score),
              'temperature',
            ],
            [t('المصدر', 'Source'), contact?.attributes?.source, 'share'],
          ].map(([label, value, icon]) => (
            <div key={label}>
              <dt>
                <NavIcon name={icon} />
                {label}
              </dt>
              <dd>{value ?? '—'}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
