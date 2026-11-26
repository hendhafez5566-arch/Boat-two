'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useData } from '../../components/business/useData';
import { useLocale } from '../../components/product/locale';
import { NavIcon } from '../../components/product/NavIcon';
import { OrdersAttention } from '../../components/business/OrdersAttention';
import { DailyWorkQueue } from '../../components/business/DailyWorkQueue';
import { SubscriptionSummary } from '../../components/business/SubscriptionSummary';
import styles from './dashboard.module.css';

type Summary = {
  channel: string; userName: string; timezone: string;
  growth: { day: string; gain: number; drop: number }[];
  ai: { enabled: boolean; sources: number; last_training: string | null };
};
const shortcuts = [
  ['/dashboard/crm','crm','العملاء','Customers','عرض ملفات العملاء','Open customer records'],
  ['/dashboard/campaigns','campaigns','الحملات','Campaigns','إدارة الرسائل التسويقية','Manage broadcasts'],
  ['/dashboard/flows','flows','مدير البوت','Bot manager','إدارة سيناريوهات المحادثة','Manage conversation flows'],
  ['/dashboard/knowledge','agents','قاعدة المعرفة','Knowledge base','مصادر إجابات المساعد','Assistant answer sources'],
  ['/dashboard/channels','channels','قنوات الاتصال','Channels','ربط وإدارة القنوات','Connect and manage channels'],
  ['/dashboard/reports','reports','التقارير','Reports','متابعة الأداء','Monitor performance'],
] as const;

export default function Dashboard() {
  const { t, language } = useLocale();
  const [channel,setChannel] = useState('all');
  const summary = useData<Summary | null>('/workspace/dashboard?channel='+channel,null);
  const workspace = useData<{role:string}|null>('/workspace',null);
  const manager = !!workspace.data && !workspace.loading && !workspace.error && workspace.data.role !== 'agent';
  const data = summary.data?.channel===channel && !summary.loading && !summary.error ? summary.data : null;
  const growth = data?.growth ?? [];
  const gain = growth.reduce((n,d)=>n+d.gain,0), drop = growth.reduce((n,d)=>n+d.drop,0);
  const maximum = Math.max(1,...growth.map(d=>d.gain));
  const fmt = new Intl.NumberFormat(language==='ar'?'ar-EG':'en');
  const x = (i:number) => 34 + i*574/Math.max(1,growth.length-1);
  const y = (n:number) => 148-118*n/maximum;
  const points = growth.map((d,i)=>x(i)+','+y(d.gain)).join(' ');
  return <main className={styles.page}>
    <header className={styles.heading}>
      <div><span className={styles.eyebrow}>{t('مساحة العمل','Workspace')} / {t('نظرة عامة','Overview')}</span>
        <h1>{t('لوحة المعلومات','Dashboard')}</h1>
        <p>{summary.data?.userName ? t('أهلًا، ','Welcome, ')+summary.data.userName+' — ' : ''}{t('تابع الأولويات وأنجز أعمالك من مكان واحد.','See priorities and manage your work in one place.')}</p>
      </div>
      <div className={styles.headerActions}>
        <button type="button" className="btn" disabled={summary.loading} onClick={()=>void summary.reload()} aria-label={t('تحديث التقرير','Refresh report')}><NavIcon name="refresh"/>{t('تحديث التقرير','Refresh report')}</button>
        <Link className="btn btn-primary" href="/dashboard/inbox"><NavIcon name="inbox"/>{t('فتح صندوق الوارد','Open inbox')}</Link>
      </div>
    </header>
    <div className={styles.workbench}>
      <div className={styles.primaryColumn}>
        <section className={styles.section} aria-labelledby="daily-title">
          <header className={styles.sectionHead}><div><h2 id="daily-title">{t('أولويات يوم العمل','Today’s priorities')}</h2><p>{t('متابعاتك المستحقة والطلبات التي تحتاج إجراء','Your due follow-ups and work requiring attention')}</p></div><Link className={styles.textLink} href="/dashboard/crm/today">{t('يوم العمل بالكامل','Open full workday')} <span aria-hidden="true">‹</span></Link></header>
          <DailyWorkQueue compact/>
        </section>
        <OrdersAttention/>
        <section className={styles.section} aria-labelledby="growth-title" aria-busy={summary.loading}>
          <header className={styles.sectionHead}><div><h2 id="growth-title">{t('نمو جهات الاتصال','Contact growth')}</h2><p>{t('آخر 30 يومًا · UTC','Last 30 days · UTC')}</p></div>
          <select className={styles.channelSelect} aria-label={t('قناة التقرير','Report channel')} value={channel} onChange={e=>setChannel(e.target.value)}>
            <option value="all">{t('كل القنوات','All channels')}</option><option value="web">Webchat</option><option value="whatsapp">WhatsApp</option><option value="telegram">Telegram</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option>
          </select></header>
          {summary.error?<p role="alert" className="notice error">{summary.error}</p>:!data?<p role="status" className={styles.empty}>{t('جارٍ تحميل التقرير…','Loading report…')}</p>:<>
            <div className={styles.growthMetrics}>
              <div><span>{t('جهات اتصال جديدة','New contacts')}</span><strong>{fmt.format(gain)}</strong></div>
              <div><span>{t('إلغاء الاشتراك التسويقي','Marketing opt-outs')}</span><strong>{fmt.format(drop)}</strong></div>
              <div><span>{t('إجمالي النشاط','Total activity')}</span><strong>{fmt.format(gain+drop)}</strong></div>
            </div>
            {growth.length>0?<div className={styles.chart}><svg viewBox="0 0 640 180" role="img" aria-label={t('جهات الاتصال الجديدة يوميًا','Daily new contacts')}>
              {[0,1,2,3].map(i=><g key={i}><line x1="34" y1={30+i*118/3} x2="608" y2={30+i*118/3}/><text x="26" y={34+i*118/3} textAnchor="end">{Math.round(maximum*(1-i/3))}</text></g>)}
              <polygon points={x(0)+',148 '+points+' '+x(growth.length-1)+',148'}/>
              <polyline points={points}/>
              {growth.map((d,i)=><g key={d.day}><circle cx={x(i)} cy={y(d.gain)} r="4"><title>{d.day}: {d.gain}</title></circle>{(i%7===0||i===growth.length-1)&&<text x={x(i)} y="169" textAnchor="middle">{d.day.slice(5)}</text>}</g>)}
            </svg></div>:<p className={styles.empty}>{t('لا توجد بيانات لهذه الفترة','No data in this period')}</p>}
          </>}
        </section>
      </div>
      <aside className={styles.secondaryColumn}>
        <section className={styles.section}><header className={styles.sectionHead}><div><h2>{t('الوصول السريع','Quick access')}</h2><p>{t('انتقل مباشرة إلى أدوات العمل','Go straight to your work tools')}</p></div></header>
          <nav className={styles.shortcutList} aria-label={t('أدوات العمل','Work tools')}>
            {shortcuts.filter(([href])=>manager||href==='/dashboard/crm'||href==='/dashboard/knowledge'||href==='/dashboard/flows').map(([href,icon,ar,en,descAr,descEn])=><Link key={href} href={href}><span className={styles.shortcutIcon}><NavIcon name={icon}/></span><span><strong>{t(ar,en)}</strong><small>{t(descAr,descEn)}</small></span><span className={styles.chevron} aria-hidden="true">‹</span></Link>)}
          </nav>
        </section>
        <section className={styles.section} aria-busy={summary.loading}><header className={styles.sectionHead}><div><h2>{t('المساعد الذكي','AI assistant')}</h2><p>{t('الحالة والمعرفة المتاحة','Status and knowledge')}</p></div><span className={styles.aiState} data-enabled={data?.ai.enabled===true}>{data?t(data.ai.enabled?'نشط':'غير نشط',data.ai.enabled?'Active':'Inactive'):'—'}</span></header>
          <dl className={styles.facts}><div><dt>{t('مصادر المعرفة','Knowledge sources')}</dt><dd>{data?fmt.format(data.ai.sources):'—'}</dd></div><div><dt>{t('آخر تدريب','Last training')}</dt><dd>{data?(data.ai.last_training?new Date(data.ai.last_training).toLocaleDateString():t('لم يحدث','Never')):'—'}</dd></div></dl>
          <Link className={styles.textLink} href="/dashboard/knowledge">{t('فتح قاعدة المعرفة','Open knowledge base')} <span aria-hidden="true">‹</span></Link>
        </section>
        <section className={styles.section}><header className={styles.sectionHead}><div><h2>{t('الاشتراك والاستخدام','Plan & usage')}</h2><p>{t('تفاصيل الباقة الحالية','Current plan details')}</p></div></header><SubscriptionSummary/></section>
      </aside>
    </div>
  </main>;
}
