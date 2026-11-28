'use client';
import { useEffect,useRef,useState } from 'react';
import { billingMoney } from '../../lib/billing-display';
import { NavIcon } from '../../components/product/NavIcon';
import styles from './platform.module.css';
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
  const lock=useRef(false);
  const [from,setFrom]=useState(()=>new Date(Date.now()-30*86400000).toISOString().slice(0,10)),[to,setTo]=useState(()=>new Date(Date.now()+86400000).toISOString().slice(0,10));
  const [applied,setApplied]=useState('');
  async function load(){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{
    const start=new Date(from+'T00:00:00Z'),end=new Date(to+'T00:00:00Z');
    if(!(end.getTime()>start.getTime())||end.getTime()-start.getTime()>366*86400000)throw new Error(t('اختر فترة صحيحة لا تتجاوز 366 يومًا','Choose a valid range of up to 366 days'));
    setData(await request('/reports?'+new URLSearchParams({from:start.toISOString(),to:end.toISOString()})) as Report);setApplied(from+' – '+to);
  }catch(err){setError((err as Error).message);}finally{lock.current=false;setBusy(false);}}
  useEffect(()=>{void load();},[]);
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
        onSubmit={e=>{e.preventDefault();void load();}}
      >
        <label>
          {t('من UTC', 'From UTC')}
          <input
            name="from"
            type="date"
            required
            value={from} onChange={e=>setFrom(e.target.value)}
          />
        </label>
        <label>
          {t('إلى UTC (غير شامل)', 'To UTC (exclusive)')}
          <input
            name="to"
            type="date"
            required
            value={to} onChange={e=>setTo(e.target.value)}
          />
        </label>
        <button className="btn" disabled={busy}>
          <NavIcon name="refresh"/>{t('تحميل التقرير', 'Load report')}
        </button>
      </form>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {busy&&<p role="status">{t('جارٍ تحميل التقرير…','Loading report…')}</p>}
      {data && (
        <>
          <p className="muted">{t('الفترة المعروضة UTC','Displayed range UTC')}: {applied}</p>
          <div className={styles.metrics}>{[[t('الشركات','Companies'),data.companies.total],[t('الشركات الموقوفة','Suspended companies'),data.companies.suspended],[t('فواتير بلا تاريخ سداد','Invoices without payment date'),data.paidInvoicesMissingPaymentDate],[t('اشتراكات بلا سعر','Unpriced subscriptions'),data.unpricedLinkedSubscriptions]].map(([label,value],i)=><div className={styles.metric} key={label}><span className={styles.metricIcon}><NavIcon name={['commerce','blocked','billing','coins'][i]}/></span><span>{label}</span><strong>{value}</strong></div>)}</div>
          <div className={styles.reportGrid}><article className={styles.reportCard}><h3>{t('فواتير مسددة خلال الفترة', 'Invoices paid in range')}</h3>
          {!data.paidInvoicesByCurrency.length&&<p className="empty">{t('لا توجد فواتير مسددة في الفترة','No paid invoices in range')}</p>}
          {data.paidInvoicesByCurrency.map((r) => (
            <p key={r.currency}>
              <strong>{billingMoney(r.gross_paid_minor_units,r.currency)}</strong><br/>{r.invoices} {t('فاتورة', 'invoices')}
            </p>
          ))}
          </article><article className={styles.reportCard}><h3>{t('الفواتير المنشأة خلال الفترة', 'Invoice creation cohort')}</h3>
          {!data.invoiceCohortByCurrency.length&&<p className="empty">{t('لا توجد فواتير في الفترة','No invoices in range')}</p>}
          {data.invoiceCohortByCurrency.map((r) => (
            <p key={r.currency}>
              <strong>{billingMoney(r.due_minor_units,r.currency)}</strong><br/>{t('متبقٍ','Remaining')}: {billingMoney(r.remaining_minor_units,r.currency)} · {t('فشل مفتوح','Failed open')}: {r.failed_open}
            </p>
          ))}
          </article><article className={styles.reportCard}><h3>
            {t('المكافئ الشهري للاشتراكات الحالية', 'Current subscription monthly equivalents')}
          </h3>
          {!data.recurringByCurrency.length&&<p className="empty">{t('لا توجد اشتراكات مسعّرة','No priced subscriptions')}</p>}
          {data.recurringByCurrency.map((r) => (
            <p key={r.currency + r.status}>
              <strong>{billingMoney(r.monthly_equivalent_minor_units,r.currency)}</strong><br/>{t('شهريًا','Monthly')} · {r.subscriptions} {t('اشتراك','subscriptions')} · {({active:t('نشط','Active'),trialing:t('تجريبي','Trial'),past_due:t('متأخر','Past due'),canceled:t('ملغى','Canceled')} as Record<string,string>)[r.status]??r.status}
            </p>
          ))}
          </article></div><p className="notice">
            {t(
              'فواتير بلا تاريخ سداد / اشتراكات بلا سعر موثّق',
              'Invoices missing payment date / subscriptions without mapped price',
            )}
            : {data.paidInvoicesMissingPaymentDate} / {data.unpricedLinkedSubscriptions}
          </p>
          <h3>{t('الحالات التشغيلية الحالية', 'Current operational state')}</h3>
          <dl className={styles.stateGrid}>
            {Object.entries({ ...data.subscriptions, ...data.queues }).map(([key, value]) => (
              <div key={key}>
                <dt>{({active:t('نشط','Active'),trialing:t('تجريبي','Trial'),past_due:t('متأخر السداد','Past due'),canceled:t('ملغى','Canceled'),pending:t('قيد الانتظار','Pending'),processing:t('قيد التنفيذ','Processing'),failed:t('فشل','Failed')} as Record<string,string>)[key]??key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
