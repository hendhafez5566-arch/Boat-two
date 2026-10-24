'use client';
import { useState } from 'react';
import { useLocale } from '../../components/product/locale';
type Report = {
  paidInvoicesByCurrency: { currency: string; invoices: number; gross_paid_minor_units: string }[];
  invoiceCohortByCurrency: {
    currency: string;
    invoices: number;
    due_minor_units: string;
    remaining_minor_units: string;
    failed_open: number;
  }[];
  recurringByCurrency: {
    currency: string;
    status: string;
    subscriptions: number;
    monthly_equivalent_minor_units: string;
  }[];
  paidInvoicesMissingPaymentDate: number;
  unpricedLinkedSubscriptions: number;
  companies: { total: number; suspended: number };
  subscriptions: Record<string, number>;
  queues: Record<string, number>;
};
export default function OperationalReports({
  request,
}: {
  request: (path: string) => Promise<unknown>;
}) {
  const { t } = useLocale(),
    [data, setData] = useState<Report | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <section className="card stack">
      <h2>{t('تشغيل المنصة وإيرادات الفواتير', 'Platform operations and invoice revenue')}</h2>
      <p className="notice">
        {t(
          'الأرقام من السجلات المحلية. المدفوعات إجمالي فواتير مسددة بتاريخ السداد ولا تخصم المبالغ المستردة أو الضرائب. تُفصل العملات دون تحويل. المكافئ الشهري تقدير تعاقدي للحالة الحالية وليس تسوية بنكية.',
          'Figures come from local ledgers. Paid totals use settlement dates and exclude refund or tax adjustments. Currencies stay separate. Monthly equivalents estimate current contracted subscriptions and are not bank reconciliation.',
        )}
      </p>
      <form
        className="form-actions"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError('');
          try {
            setData(
              (await request(
                '/reports?' +
                  new URLSearchParams({
                    from: new Date(String(f.get('from')) + 'T00:00:00Z').toISOString(),
                    to: new Date(String(f.get('to')) + 'T00:00:00Z').toISOString(),
                  }),
              )) as Report,
            );
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {t('من UTC', 'From UTC')}
          <input
            name="from"
            type="date"
            required
            defaultValue={new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)}
          />
        </label>
        <label>
          {t('إلى UTC (غير شامل)', 'To UTC (exclusive)')}
          <input
            name="to"
            type="date"
            required
            defaultValue={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
          />
        </label>
        <button className="btn" disabled={busy}>
          {t('تحميل التقرير', 'Load report')}
        </button>
      </form>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {data && (
        <>
          <p>
            {t('الشركات / الموقوفة', 'Companies / suspended')}: {data.companies.total} /{' '}
            {data.companies.suspended}
          </p>
          <h3>{t('فواتير مسددة خلال الفترة', 'Invoices paid in range')}</h3>
          {data.paidInvoicesByCurrency.map((r) => (
            <p key={r.currency}>
              {r.currency.toUpperCase()}: {r.gross_paid_minor_units} {t('وحدة صغرى', 'minor units')}{' '}
              · {r.invoices} {t('فاتورة', 'invoices')}
            </p>
          ))}
          <h3>{t('الفواتير المنشأة خلال الفترة', 'Invoice creation cohort')}</h3>
          {data.invoiceCohortByCurrency.map((r) => (
            <p key={r.currency}>
              {r.currency.toUpperCase()} · {t('مستحق / متبقٍ', 'Due / remaining')}:{' '}
              {r.due_minor_units} / {r.remaining_minor_units} · {t('فشل مفتوح', 'Failed open')}:{' '}
              {r.failed_open}
            </p>
          ))}
          <h3>
            {t('المكافئ الشهري للاشتراكات الحالية', 'Current subscription monthly equivalents')}
          </h3>
          {data.recurringByCurrency.map((r) => (
            <p key={r.currency + r.status}>
              {r.currency.toUpperCase()} · {r.status} · {r.monthly_equivalent_minor_units}{' '}
              {t('وحدة صغرى شهريًا', 'minor units per month')} · {r.subscriptions}
            </p>
          ))}
          <p className="notice">
            {t(
              'فواتير بلا تاريخ سداد / اشتراكات بلا سعر موثّق',
              'Invoices missing payment date / subscriptions without mapped price',
            )}
            : {data.paidInvoicesMissingPaymentDate} / {data.unpricedLinkedSubscriptions}
          </p>
          <h3>{t('الحالات التشغيلية الحالية', 'Current operational state')}</h3>
          <dl>
            {Object.entries({ ...data.subscriptions, ...data.queues }).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
