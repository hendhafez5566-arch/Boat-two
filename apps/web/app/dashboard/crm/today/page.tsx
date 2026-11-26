'use client';
import Link from 'next/link';
import { useLocale } from '../../../../components/product/locale';
import { DailyWorkQueue } from '../../../../components/business/DailyWorkQueue';
import { NavIcon } from '../../../../components/product/NavIcon';
export default function TodayPage(){
 const {t}=useLocale();
 return <main className="stack" data-professional-workday>
   <header className="workspace-heading"><div><span className="muted">{t('العملاء / يوم العمل','CRM / Workday')}</span><h1>{t('يوم العمل','Workday')}</h1><p>{t('ابدأ بالمتابعات المتأخرة، ثم المستحقة اليوم. اضغط على أي متابعة لفتح ملف العميل.','Start with overdue follow-ups, then tasks due today. Open any task to see the customer record.')}</p></div><div className="workday-actions"><Link href="/dashboard/crm/tasks" className="btn">{t('كل المتابعات','All follow-ups')}</Link><Link href="/dashboard/crm?create=true" className="btn btn-primary"><NavIcon name="plus"/>{t('إضافة عميل','Add customer')}</Link></div></header>
   <DailyWorkQueue/>
 </main>;
}
