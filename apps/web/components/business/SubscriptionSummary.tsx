'use client';
import Link from 'next/link';
import {useLocale} from '../product/locale';
import {NavIcon} from '../product/NavIcon';
import {useSubscriptionUsage} from './SubscriptionUsageProvider';
export function SubscriptionSummary(){
 const {t,language}=useLocale(),snapshot=useSubscriptionUsage(),usage=snapshot?.usage;
 const n=new Intl.NumberFormat(language==='ar'?'ar-EG':'en-GB');
 return <div className="dashboard-plan" aria-label={t('الباقة الحالية','Current plan')}>
 {usage?<><strong>{t('الباقة','Plan')} · <bdi>{usage.plan.plan_name}</bdi></strong>{snapshot?.stale&&<small role="status">{t('آخر بيانات متاحة — تعذّر التحديث','Last available data — refresh failed')}</small>}<div className="dashboard-usage-row">{([[t('الرسائل','Messages'),usage.messages],[t('العملاء','Contacts'),usage.contacts],[t('AI','AI'),usage.ai]] as const).map(([label,m])=><div key={label}><small>{label}</small><strong><bdi>{n.format(m.used)} / {m.limit===-1?'∞':n.format(m.limit)}</bdi></strong>{m.percent!=null&&<progress aria-label={label} max={100} value={Math.min(100,Math.max(0,m.percent))}/>}</div>)}</div></>:<small role="status">{snapshot?.stale?t('تعذّر تحميل الاستهلاك','Usage unavailable'):t('جارٍ تحميل الاستهلاك…','Loading usage…')}</small>}
 <Link href="/dashboard/subscription"><NavIcon name="reports"/>{t('تفاصيل الاستهلاك','Usage details')}</Link><Link href="/dashboard/subscription?tab=plans"><NavIcon name="upgrade"/>{t('الباقات والترقية','Plans & upgrades')}</Link><Link href="/dashboard/subscription?tab=billing"><NavIcon name="billing"/>{t('الفواتير والمدفوعات','Invoices & payments')}</Link></div>
}
