'use client';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import RecordEditor from './RecordEditor';
import styles from './platform.module.css';
import { NavIcon } from '../../components/product/NavIcon';
import { useTransientNotice } from '../../components/product/useTransientNotice';
import { billingMoney } from '../../lib/billing-display';
import { useLocale } from '../../components/product/locale';
type Price = {
  provider_id: string;
  plan_code: string;
  amount_cents: number;
  currency: string;
  interval: string;
  active: boolean;
};
export default function PriceCatalog({
  request,
  canWrite,plans,onChanged,editorProps,
}: {
  request: (path: string, body?: unknown, method?: string) => Promise<unknown>;
  canWrite: boolean;
  editorProps:Pick<ComponentProps<typeof RecordEditor>,'canClose'|'disabled'|'verification'|'feedback'>;
  plans: {code:string;name:string;is_active:boolean}[];
  onChanged:()=>Promise<void>;
}) {
  const { t } = useLocale();
  const [prices, setPrices] = useState<Price[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const lock=useRef(false),[loaded,setLoaded]=useState(false),[notice,setNotice]=useState(''),[filter,setFilter]=useState('all'),[search,setSearch]=useState('');
  useTransientNotice(notice,()=>setNotice(''));
  const visible=prices.filter(p=>(filter==='all'||p.active===(filter==='active'))&&[p.plan_code,p.provider_id,p.currency].join(' ').toLowerCase().includes(search.toLowerCase()));
  async function load() {
    setPrices((await request('/prices')) as Price[]);setLoaded(true);
  }
  async function act(fn?: () => Promise<unknown>) {
    if(lock.current||fn&&!canWrite)return;lock.current=true;setBusy(true);
    setError('');
    try {
      if(fn){await fn();setNotice(t('تم تحديث الكتالوج','Catalog updated'));await onChanged();}
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current=false;setBusy(false);
    }
  }
  useEffect(()=>{void act();},[]);
  return (
    <section className="card stack">
      <h2>{t('كتالوج أسعار Stripe', 'Stripe price catalog')}</h2>
      <p className="notice">
        {t(
          'سجّل سعرًا موجودًا بعد مراجعته لدى Stripe. هذا الإجراء يحدّث الكتالوج المحلي فقط. الأسعار محفوظة للتاريخ ولا تُعدّل أو تُحذف؛ تقاعد السعر يمنع اشتراكات جديدة به.',
          'Register an existing price after verifying it in Stripe. This updates the local catalog only. Historical prices are immutable; retiring a price prevents new subscriptions using it.',
        )}
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <button className="btn" disabled={busy} onClick={() => void act()}>
        <NavIcon name="refresh"/>{t('تحميل الأسعار', 'Load prices')}
      </button>
      {notice&&<p role="status" className="notice">{notice}</p>}
      {canWrite&&<RecordEditor {...editorProps} disabled={busy||editorProps.disabled} variant="create" title={t('تسجيل سعر جديد','Register new price')} action={t('تسجيل سعر جديد','Register new price')} summary={<strong>{t('ربط سعر موثق بباقة','Map a verified price to a plan')}</strong>} feedback={<>{editorProps.feedback}{error&&<p role="alert" className="notice error">{error}</p>}{notice&&<p role="status" className="notice">{notice}</p>}</>}><form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if(!confirm(t('تسجيل السعر في الكتالوج المحلي فقط؟','Register price in the local catalog only?')))return;
          void act(() =>
            request('/prices', {
              planCode: f.get('planCode'),
              priceId: f.get('priceId'),
              amountCents: Number(f.get('amount')),
              currency: f.get('currency'),
              interval: f.get('interval'),
              reason: f.get('reason'),
            }),
          );
        }}
      >
        <label>
          {t('رمز الخطة', 'Plan code')}
          <select name="planCode" required><option value="">{t("اختر باقة","Select plan")}</option>{plans.filter(p=>p.is_active&&p.code!=="free").map(p=><option key={p.code} value={p.code}>{p.name} ({p.code})</option>)}</select>
        </label>
        <label>
          Stripe price ID
          <input name="priceId" required pattern="price_[A-Za-z0-9_]+" maxLength={255} />
        </label>
        <label>
          {t('المبلغ بوحدة العملة الصغرى', 'Amount in minor currency units')}
          <input name="amount" type="number" required min={1} max={1000000000} />
        </label>
        <label>
          {t('العملة', 'Currency')}
          <input name="currency" required pattern="[a-z]{3}" defaultValue="usd" />
        </label>
        <label>
          {t('دورة الفوترة', 'Billing interval')}
          <select name="interval">
            <option value="month">{t('شهري', 'Monthly')}</option>
            <option value="year">{t('سنوي', 'Yearly')}</option>
          </select>
        </label>
        <label>
          {t('سبب موثّق ودليل المراجعة', 'Reason and verification evidence')}
          <textarea name="reason" required minLength={10} maxLength={1000} />
        </label>
        <button className="btn btn-primary" disabled={busy || !canWrite}>
          {t('تسجيل سعر جديد', 'Register new price')}
        </button>
      </form></RecordEditor>}
      <div className="form-actions"><input type="search" aria-label={t('بحث الأسعار','Search prices')} value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label={t('حالة السعر','Price status')} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">{t('كل الحالات','All statuses')}</option><option value="active">{t('متاح','Available')}</option><option value="retired">{t('متقاعد','Retired')}</option></select><span className="muted">{visible.length} / {prices.length}</span></div>
      {busy&&<p role="status">{t('جارٍ التحميل…','Loading…')}</p>}
      {loaded&&!busy&&!error&&!visible.length&&<p className="empty">{t('لا توجد أسعار مطابقة','No matching prices')}</p>}
      {visible.map((p) => (
        <article key={p.provider_id} className={styles.priceRow}>
          <strong>
            {p.plan_code} · {p.provider_id}
          </strong>
          <p>
            {billingMoney(p.amount_cents,p.currency)} / {p.interval==='year'?t('سنة','year'):t('شهر','month')} ·{' '}
            {p.active ? t('متاح', 'Available') : t('متقاعد', 'Retired')}
          </p>
          {p.active && canWrite && (
            <RecordEditor {...editorProps} disabled={busy||editorProps.disabled} title={t('تقاعد السعر','Retire price')} action={t('تقاعد السعر','Retire price')} summary={<span>{t('إيقاف الاشتراكات الجديدة بهذا السعر','Stop new subscriptions at this price')}</span>} feedback={<>{editorProps.feedback}{error&&<p role="alert" className="notice error">{error}</p>}{notice&&<p role="status" className="notice">{notice}</p>}</>}><form
              onSubmit={(e) => {
                e.preventDefault();
                const reason = new FormData(e.currentTarget).get('reason');
                if(confirm(t('تقاعد السعر ومنع الاشتراكات الجديدة به؟','Retire this price and prevent new subscriptions using it?')))void act(() => request(`/prices/${p.provider_id}/retire`, { reason }));
              }}
            >
              <label>
                {t('سبب التقاعد', 'Retirement reason')}
                <input name="reason" required minLength={10} maxLength={1000} />
              </label>
              <button className="btn" disabled={busy || !canWrite}>
                {t('تقاعد السعر', 'Retire price')}
              </button>
            </form></RecordEditor>
          )}
        </article>
      ))}
    </section>
  );
}
