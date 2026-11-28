'use client';
import Link from 'next/link';
import {useLocale} from '../../../components/product/locale';
import {NavIcon} from '../../../components/product/NavIcon';
import {statusLabel} from '../../../components/product/status';
import {billingDate,billingMoney,type BillingPlan,type BillingStatus} from '../../../lib/billing-display';
import type {Usage} from '../../../components/business/SubscriptionUsageProvider';
import styles from './subscription.module.css';
export default function CurrentSubscription({usage,plan,billing,stale,billingLoading,billingError,role}:{usage:Usage|null|undefined;plan:BillingPlan|undefined;billing:BillingStatus|null;stale:boolean;billingLoading:boolean;billingError:string;role?:string}){
 const {t,language}=useLocale(),n=new Intl.NumberFormat(language==='ar'?'ar-EG':'en-GB');
 const date=(value:string|null|undefined)=>value?billingDate(value,language,'UTC'):'—';
 if(!usage)return <section className={styles.panel} role={stale?'alert':'status'}>{stale?t('تعذّر تحميل الاشتراك','Subscription unavailable'):t('جارٍ تحميل الاشتراك…','Loading subscription…')}</section>;
 const effective=usage.plan,sub=!billingLoading&&!billingError?billing?.subscription:null;
 const trial=effective.status==='trialing'&&!effective.trial_expired,trialEnd=effective.trial_ends_at;
 const renewal=sub?.linked&&['active','trialing'].includes(sub.status)&&!sub.cancelAtPeriodEnd?sub.currentPeriodEnd:null;
 const end=trial?trialEnd:effective.current_period_end;
 const days=end?Math.max(0,Math.ceil((Date.parse(end)-Date.parse(usage.asOf))/86400000)):null;
 const displayStatus=effective.trial_expired?t('انتهت التجربة','Trial ended'):effective.delinquent_restricted?t('مقيد بسبب تأخر الدفع','Restricted due to overdue payment'):statusLabel(effective.status,t);
 return <div className={styles.content}>
 {stale&&<p className="notice" role="status">{t('آخر بيانات متاحة؛ تعذّر التحديث الآن.','Last available data; refresh currently unavailable.')}</p>}
 <section className={styles.hero}><div><span>{t('باقتك الفعلية','Effective plan')}</span><h2>{effective.plan_name}</h2><p>{displayStatus}</p></div><div className={styles.heroActions}><Link className="btn" href="/dashboard/subscription?tab=plans"><NavIcon name="upgrade"/>{t('عرض الباقات','View plans')}</Link><Link className="btn" href="/dashboard/subscription?tab=usage"><NavIcon name="reports"/>{t('متابعة الاستهلاك','View usage')}</Link></div></section>
 <div className={styles.summaryGrid}>
 <article className={styles.panel}><h2><NavIcon name="calendar"/>{t('مدة الاشتراك','Subscription term')}</h2><dl className={styles.sideFacts}><div><dt>{t('نهاية التجربة','Trial end')}</dt><dd>{date(trialEnd)}</dd></div><div><dt>{t('نهاية فترة الاشتراك','Subscription period end')}</dt><dd>{date(effective.current_period_end)}</dd></div><div><dt>{t('الأيام المتبقية','Days remaining')}</dt><dd>{days!==null&&Number.isFinite(days)?n.format(days):'—'}</dd></div></dl></article>
 <article className={styles.panel}><h2><NavIcon name="billing"/>{t('السعر والتجديد','Price and renewal')}</h2><dl className={styles.sideFacts}><div><dt>{t('سعر الكتالوج الحالي','Current catalog price')}</dt><dd>{plan?<>{billingMoney(plan.price_cents,plan.currency)} / {plan.interval==='year'?t('سنة','year'):t('شهر','month')}</>:'—'}</dd></div><div><dt>{t('التجديد المقبل','Next renewal')}</dt><dd>{date(renewal)}</dd></div><div><dt>{t('التجديد التلقائي','Automatic renewal')}</dt><dd>{renewal?t('مفعّل','On'):sub?.linked&&sub.cancelAtPeriodEnd?t('متوقف','Off'):t('غير مؤكد','Unconfirmed')}</dd></div></dl><p className={styles.muted}>{t('سعر الكتالوج ليس بالضرورة مبلغ عقدك الحالي؛ راجع الفواتير لمعرفة المبلغ الفعلي.','Catalog price may differ from your existing contract; see invoices for actual charges.')}</p>{['owner','admin'].includes(role??'')&&<Link href="/dashboard/subscription?tab=billing" className="btn">{t('الفواتير والمدفوعات','Invoices & payments')}</Link>}</article>
 <article className={styles.panel}><h2><NavIcon name="reports"/>{t('دورة حدود الاستخدام','Usage quota cycle')}</h2><dl className={styles.sideFacts}><div><dt>{t('بدأت في','Started')}</dt><dd>{date(usage.cycleStart)}</dd></div><div><dt>{t('تتجدد الحصص في','Quotas reset')}</dt><dd>{date(usage.cycleEnd)}</dd></div></dl><p className={styles.muted}>{t('دورة الحصص منفصلة عن موعد تجديد الدفع.','Quota reset is separate from payment renewal.')}</p></article>
 </div>
 {(effective.trial_expired||effective.delinquent_restricted)&&<p className={styles.warning} role="status">{t('تطبق حاليًا حدود الباقة المجانية. راجع الباقات المتاحة لاستعادة السعة.','Free plan limits currently apply. Review available plans to restore capacity.')}</p>}
 {billingError&&<p className="notice error" role="alert">{t('تعذّر التحقق من تفاصيل الفوترة.','Billing details could not be verified.')}</p>}
 {billing?.configured===false&&!billingError&&<p className={styles.muted}>{t('الدفع الإلكتروني غير متاح حاليًا.','Online payment is currently unavailable.')}</p>}
 <section className={styles.panel}><h2>{t('مساعدة الاشتراك','Subscription support')}</h2><Link className="btn" href="/dashboard/support"><NavIcon name="support"/>{t('تواصل مع الدعم','Contact support')}</Link></section>
 </div>;
}
