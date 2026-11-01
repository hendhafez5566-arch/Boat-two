'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CrmNav } from './CrmNav';
import { useData } from './useData';
import { download, exportCsv } from './csv';
import { useLocale } from '../product/locale';
import { NavIcon } from '../product/NavIcon';
import styles from './crm-workspace.module.css';
type Sale = { currency: string; status: string; count: number; value_cents: string };
type Intelligence = {
  startAt: string;
  endAt: string;
  contacts: {
    total: number;
    new: number;
    leads: number;
    qualified: number;
    unassigned: number;
    unattended: number;
  };
  sales: Sale[];
  pipeline: {
    pipeline_id: string;
    stage: string;
    currency: string;
    count: number;
    value_cents: string;
  }[];
  followups: { open: number; overdue: number; today: number; done: number };
  sources: { source: string; count: number }[];
  losses: { reason: string; count: number }[];
  growth: { day: string; count: number; start_at: string; end_at: string }[];
  employees: {
    user_id: string;
    full_name: string;
    overdue: number;
    completed: number;
    won: number;
  }[];
  attention: { id: string; name: string }[];
  conversations: { needs_reply: number };
  from: string;
  to: string;
  today: string;
  timezone: string;
  scope: string;
  ownerId: string | null;
  role: string;
  generatedAt: string;
};
export function CrmIntelligence({ report = false }: { report?: boolean }) {
  const { t, language } = useLocale();
  const [preset, setPreset] = useState('30'),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [mine, setMine] = useState(false);
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  if (mine) q.set('mine', 'true');
  const data = useData<Intelligence | null>('/crm/workspace/analytics?' + q, null);
  const r = data.data;
  const money = (c: string, v: string) =>
    new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en', {
      style: 'currency',
      currency: c,
    }).format(Number(v) / 100);
  function range(value: string) {
    setPreset(value);
    if (value === 'custom') return;
    const end = r?.today || new Date().toISOString().slice(0, 10);
    const start = new Date(end + 'T12:00:00Z');
    if (value === 'month') start.setUTCDate(1);
    else start.setUTCDate(start.getUTCDate() - Number(value) + 1);
    setFrom(start.toISOString().slice(0, 10));
    setTo(end);
  }
  const contactLink = (filter: string) =>
    '/dashboard/crm?' +
    new URLSearchParams({ preset: filter, ...(r?.ownerId ? { ownerId: r.ownerId } : {}) });
  const workLink = (kind: string, status = 'open', period = '') =>
    '/dashboard/crm/' +
    kind +
    '?' +
    new URLSearchParams({
      status,
      ...(kind === 'pipeline' ? { view: 'table', allPipelines: 'true' } : {}),
      ...(r?.ownerId ? { ownerId: r.ownerId } : {}),
      ...(period ? { period } : {}),
      ...(!period && r ? { updatedFrom: r.startAt, updatedTo: r.endAt } : {}),
    });
  const won = r?.sales.filter((s) => s.status === 'won').reduce((a, s) => a + s.count, 0) || 0;
  const closed = r?.sales.filter((s) => s.status !== 'open').reduce((a, s) => a + s.count, 0) || 0;
  const metrics = r
    ? [
        {
          label: t('عملاء جدد', 'New customers'),
          value: r.contacts.new,
          icon: 'crm',
          tone: 'blue',
          href:
            contactLink('new') +
            `&createdFrom=${encodeURIComponent(r.startAt)}&createdTo=${encodeURIComponent(r.endAt)}`,
          hint: t('خلال الفترة المحددة', 'In selected period'),
        },
        {
          label: t('عملاء محتملون', 'Leads'),
          value: r.contacts.leads,
          icon: 'user',
          tone: 'violet',
          href: contactLink('leads'),
          hint: t('ملفات نشطة الآن', 'Active profiles now'),
        },
        {
          label: t('فرص مفتوحة', 'Open opportunities'),
          value: r.sales.filter((s) => s.status === 'open').reduce((a, s) => a + s.count, 0),
          icon: 'handshake',
          tone: 'blue',
          href: workLink('pipeline'),
          hint: t('آخر تحديث خلال الفترة', 'Last updated in period'),
        },
        {
          label: t('متابعات متأخرة', 'Overdue follow-ups'),
          value: r.followups.overdue,
          icon: 'userClock',
          tone: 'red',
          href: workLink('tasks', 'open', 'overdue'),
          hint: t('تحتاج اهتمامك الآن', 'Needs attention now'),
        },
        {
          label: t('المطلوب اليوم', 'Due today'),
          value: r.followups.today,
          icon: 'calendar',
          tone: 'orange',
          href: workLink('tasks', 'open', 'today'),
          hint: t('حسب توقيت شركتك', 'In workspace timezone'),
        },
        {
          label: t('دون مسؤول', 'Unassigned customers'),
          value: r.contacts.unassigned,
          icon: 'team',
          tone: 'orange',
          href: contactLink('unassigned'),
          hint: t('ملفات تحتاج تعيينًا', 'Profiles needing an owner'),
        },
        {
          label: t('متابعات مكتملة', 'Completed follow-ups'),
          value: r.followups.done,
          icon: 'circleCheck',
          tone: 'green',
          href: workLink('tasks', 'done'),
          hint: t('آخر تحديث خلال الفترة', 'Last updated in period'),
        },
        {
          label: t('نجاح الفرص المغلقة', 'Closed opportunity win rate'),
          value: closed ? Math.round((won / closed) * 100) + '%' : '—',
          icon: 'reports',
          tone: 'green',
          href: workLink('pipeline', 'won'),
          hint: t('ناجحة ÷ ناجحة وخاسرة', 'Won ÷ won and lost'),
        },
      ]
    : [];
  function exportReport() {
    if (!r) return;
    const rows: Record<string, unknown>[] = [
      ...r.sales.map((s) => ({
        section: 'sales',
        label: s.status,
        currency: s.currency,
        count: s.count,
        value_cents: s.value_cents,
        from: r.from,
        to: r.to,
        timezone: r.timezone,
      })),
      ...r.sources.map((s) => ({
        section: 'sources',
        label: s.source,
        count: s.count,
        from: r.from,
        to: r.to,
        timezone: r.timezone,
      })),
      ...r.employees.map((e) => ({
        section: 'employees',
        label: e.full_name,
        count: e.won,
        completed: e.completed,
        overdue: e.overdue,
        from: r.from,
        to: r.to,
        timezone: r.timezone,
      })),
    ];
    download(
      'boat-crm-report.csv',
      exportCsv(rows, [
        'section',
        'label',
        'count',
        'currency',
        'value_cents',
        'completed',
        'overdue',
        'from',
        'to',
        'timezone',
      ]),
      'text/csv',
    );
  }
  return (
    <main className={styles.page}>
      <CrmNav />
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            <NavIcon name={report ? 'reports' : 'crm'} />
            {t('مساحة علاقات العملاء', 'CUSTOMER WORKSPACE')}
          </span>
          <h1>
            {report
              ? t('رؤية أوضح. قرارات أفضل.', 'Clear insights. Better decisions.')
              : t('كل فرصة تبدأ بعلاقة.', 'Every opportunity starts with a relationship.')}
          </h1>
          <p>
            {report
              ? t(
                  'اعرف ما يتحرك، وما يحتاج اهتمامًا، بالأرقام الفعلية.',
                  'See what is moving and what needs attention with real data.',
                )
              : t(
                  'عملاؤك ومبيعاتك ومتابعات فريقك، في مساحة عمل واحدة.',
                  'Customers, sales and team follow-ups in one workspace.',
                )}
          </p>
        </div>
        <div className={styles.actions}>
          <Link className="btn btn-primary" href="/dashboard/crm?create=true">
            <NavIcon name="plus" />
            {t('إضافة عميل', 'Add customer')}
          </Link>
          <Link className="btn" href="/dashboard/crm/tasks?create=true">
            <NavIcon name="calendar" />
            {t('إضافة متابعة', 'Add follow-up')}
          </Link>
        </div>
      </header>
      <div className={styles.toolbar}>
        <span className={styles.scope}>
          <NavIcon name="calendar" />
          {t('الفترة', 'Period')}
        </span>
        <select
          aria-label={t('فترة التقرير', 'Report period')}
          value={preset}
          onChange={(e) => range(e.target.value)}
        >
          <option value="1">{t('اليوم', 'Today')}</option>
          <option value="7">{t('آخر 7 أيام', 'Last 7 days')}</option>
          <option value="30">{t('آخر 30 يومًا', 'Last 30 days')}</option>
          <option value="month">{t('الشهر الحالي', 'This month')}</option>
          <option value="custom">{t('فترة مخصصة', 'Custom range')}</option>
        </select>
        {preset === 'custom' && (
          <>
            <input
              type="date"
              aria-label={t('من تاريخ', 'From date')}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <input
              type="date"
              aria-label={t('إلى تاريخ', 'To date')}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </>
        )}
        <button
          className="btn"
          aria-pressed={mine || r?.role === 'agent'}
          onClick={() => setMine(!mine)}
        >
          <NavIcon name="user" />
          {mine || r?.role === 'agent' ? t('عملي فقط', 'My work') : t('الفريق كله', 'All team')}
        </button>
        <button className="btn" onClick={() => void data.reload()}>
          <NavIcon name="refresh" />
          {t('تحديث', 'Refresh')}
        </button>
        {report && (
          <button className="btn" disabled={!r || data.loading} onClick={exportReport}>
            <NavIcon name="export" />
            {t('تصدير CSV', 'Export CSV')}
          </button>
        )}
      </div>
      {data.error && (
        <p className="notice error" role="alert">
          {data.error}
        </p>
      )}
      {data.loading && (
        <div className={styles.skeleton} role="status">
          {t('جارٍ تحديث مساحة العمل…', 'Updating your workspace…')}
        </div>
      )}
      {r && (
        <>
          <div className={styles.metrics}>
            {metrics.map((m) => (
              <Link href={m.href} className={styles.stat} key={m.icon + m.label} data-tone={m.tone}>
                <span className={styles.statIcon}>
                  <NavIcon name={m.icon} />
                </span>
                <span>
                  {m.label}
                  <strong>{m.value}</strong>
                  <small>{m.hint}</small>
                </span>
                <NavIcon name="chevron" />
              </Link>
            ))}
          </div>
          <div className={styles.split}>
            <section className={styles.panel}>
              <header className={styles.panelTitle}>
                <h2>
                  <NavIcon name="reports" />
                  {t('نمو علاقاتك', 'Customer growth')}
                </h2>
                <span>
                  {r.from} — {r.to}
                </span>
              </header>
              <div
                className={styles.chart}
                aria-label={t('عملاء جدد حسب اليوم', 'New customers by day')}
              >
                {r.growth.map((g) => (
                  <Link
                    key={g.day}
                    href={
                      contactLink('new') +
                      `&createdFrom=${encodeURIComponent(g.start_at)}&createdTo=${encodeURIComponent(g.end_at)}`
                    }
                    title={`${g.day}: ${g.count}`}
                    aria-label={`${g.day}: ${g.count}`}
                  >
                    <span
                      style={{
                        height: Math.max(
                          3,
                          (g.count / Math.max(1, ...r.growth.map((x) => x.count))) * 140,
                        ),
                      }}
                    />
                    <small>{g.day.slice(5)}</small>
                  </Link>
                ))}
              </div>
              <p className={styles.hint}>
                {t(
                  'عدد الملفات المنشأة يوميًا، دون المدمج أو المؤرشف. اضغط على اليوم لعرض التفاصيل.',
                  'Daily created profiles excluding merged or archived contacts. Select a day for details.',
                )}
              </p>
            </section>
            <section className={styles.panel}>
              <h2>
                <NavIcon name="coins" />
                {t('القيمة حسب العملة', 'Value by currency')}
              </h2>
              {r.sales.length ? (
                r.sales.map((s) => (
                  <Link
                    className={styles.valueRow}
                    href={workLink('pipeline', s.status)}
                    key={s.currency + s.status}
                  >
                    <span
                      className={styles.badge}
                      data-tone={
                        s.status === 'won' ? 'green' : s.status === 'lost' ? 'red' : 'blue'
                      }
                    >
                      {s.status === 'won'
                        ? t('ناجحة', 'Won')
                        : s.status === 'lost'
                          ? t('خاسرة', 'Lost')
                          : t('مفتوحة', 'Open')}{' '}
                      · {s.count}
                    </span>
                    <strong dir="auto">{money(s.currency, s.value_cents)}</strong>
                  </Link>
                ))
              ) : (
                <div className={styles.empty}>
                  <NavIcon name="handshake" />
                  <p>
                    {t(
                      'أضف أول فرصة لبدء متابعة المبيعات.',
                      'Add your first opportunity to start tracking sales.',
                    )}
                  </p>
                  <Link className="btn" href="/dashboard/crm/pipeline?create=true">
                    {t('إنشاء فرصة', 'Create opportunity')}
                  </Link>
                </div>
              )}
            </section>
          </div>
          <div className={styles.split}>
            <section className={styles.panel}>
              <h2>
                <NavIcon name="userClock" />
                {t('عملاء يحتاجون متابعة', 'Customers needing a follow-up')}
              </h2>
              {r.attention.map((c) => (
                <Link
                  className={styles.personRow}
                  href={'/dashboard/crm?contact=' + c.id}
                  key={c.id}
                >
                  <span className={styles.avatar}>{(c.name || '?').slice(0, 2)}</span>
                  <strong>{c.name || t('عميل', 'Customer')}</strong>
                  <span className={styles.badge} data-tone="orange">
                    {t('دون متابعة مفتوحة', 'No open follow-up')}
                  </span>
                </Link>
              ))}
              {!r.attention.length && (
                <p className={styles.empty}>
                  <NavIcon name="circleCheck" />
                  {t(
                    'لا توجد ملفات بحاجة إلى متابعة ضمن هذا النطاق.',
                    'No profiles without a follow-up in this scope.',
                  )}
                </p>
              )}
              <Link className="btn" href={contactLink('unattended')}>
                {t('عرض كل الملفات دون متابعة', 'View all without follow-up')}
              </Link>
            </section>
            <section className={styles.panel}>
              <h2>
                <NavIcon name="globe" />
                {t('مصادر العملاء', 'Customer sources')}
              </h2>
              {r.sources.map((s) => (
                <Link
                  className={styles.sourceRow}
                  href={
                    '/dashboard/crm?' +
                    new URLSearchParams({
                      source: s.source === 'Unknown' ? '' : s.source,
                      createdFrom: r.startAt,
                      createdTo: r.endAt,
                      ...(r.ownerId ? { ownerId: r.ownerId } : {}),
                    })
                  }
                  key={s.source}
                >
                  <span>{s.source === 'Unknown' ? t('غير محدد', 'Unknown') : s.source}</span>
                  <meter
                    min="0"
                    max={Math.max(1, ...r.sources.map((x) => x.count))}
                    value={s.count}
                  />
                  <strong>{s.count}</strong>
                </Link>
              ))}
              {!r.sources.length && (
                <p className={styles.empty}>
                  {t(
                    'ستظهر المصادر عند إضافة العملاء.',
                    'Sources appear when customers are added.',
                  )}
                </p>
              )}
            </section>
          </div>
          {report && (
            <>
              <section className={styles.panel}>
                <h2>
                  <NavIcon name="team" />
                  {t('أداء الموظفين', 'Team performance')}
                </h2>
                <div className={styles.scroll}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>{t('الموظف', 'Employee')}</th>
                        <th>{t('متابعات مكتملة', 'Completed follow-ups')}</th>
                        <th>{t('متأخرة الآن', 'Overdue now')}</th>
                        <th>{t('فرص ناجحة', 'Won opportunities')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.employees.map((e) => (
                        <tr key={e.user_id}>
                          <td>
                            <Link href={'/dashboard/crm/tasks?ownerId=' + e.user_id}>
                              {e.full_name}
                            </Link>
                          </td>
                          <td>{e.completed}</td>
                          <td>
                            <span className={styles.badge} data-tone={e.overdue ? 'red' : 'green'}>
                              {e.overdue}
                            </span>
                          </td>
                          <td>{e.won}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className={styles.panel}>
                <h2>{t('أسباب خسارة الفرص', 'Loss reasons')}</h2>
                {r.losses.map((l) => (
                  <p className={styles.valueRow} key={l.reason}>
                    <span>
                      {l.reason === 'Unknown' ? t('لم يُحدد سبب', 'No reason recorded') : l.reason}
                    </span>
                    <strong>{l.count}</strong>
                  </p>
                ))}
                {!r.losses.length && (
                  <p>
                    {t('لا توجد فرص خاسرة في الفترة.', 'No lost opportunities in this period.')}
                  </p>
                )}
              </section>
            </>
          )}
          <details className={styles.definitions}>
            <summary>{t('كيف تُحسب هذه الأرقام؟', 'How are these metrics calculated?')}</summary>
            <p>
              {t(
                'العملاء الجدد حسب تاريخ الإنشاء. الصفقات حسب آخر تحديث وحالتها الحالية، وليست دفتر إيرادات تاريخيًا. المتابعات المكتملة حسب آخر تحديث؛ المتأخرة والمطلوب اليوم حالة حالية. العملات منفصلة ولا تُجمع.',
                'New customers use creation date. Opportunities use last update and current status, not a historical revenue ledger. Completed follow-ups use last update; overdue and due-today are current snapshots. Currencies are never combined.',
              )}
            </p>
            <p>
              {r.timezone} · {r.from} — {r.to} · {t('تحديث', 'Updated')}:{' '}
              {new Date(r.generatedAt).toLocaleString(language === 'ar' ? 'ar-EG' : 'en')}
            </p>
          </details>
        </>
      )}
    </main>
  );
}
