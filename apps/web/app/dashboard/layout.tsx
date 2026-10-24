'use client';
import {statusLabel} from '../../components/product/status';
import { WorkspaceMenu } from '../../components/product/WorkspaceMenu';
import { NavIcon } from '../../components/product/NavIcon';
import { CSSProperties, ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { api, getSession, setSession } from '../../lib/api';
import { useBrand } from '../../components/product/BrandContext';
import { useLocale } from '../../components/product/locale';
const links = [
  ['', '◈', 'نظرة عامة', 'Overview'],
  ['onboarding', '◷', 'دليل البداية', 'Getting started'],
  ['inbox', '▤', 'صندوق الوارد', 'Inbox'],
  ['crm', '◉', 'إدارة العملاء', 'CRM'],
  ['flows', '⌘', 'مصمم البوت', 'Bot builder'],
  ['campaigns', '➤', 'الحملات', 'Campaigns'],
  ['sequences', '⏱', 'التسلسلات', 'Sequences'],
  ['automations', '⚡', 'أتمتة الأعمال', 'Automations'],
  ['agents', '✧', 'مساعدو AI', 'AI agents'],
  ['knowledge', '▣', 'قاعدة المعرفة', 'Knowledge'],
  ['reports', '▤', 'التقارير والتحليلات', 'Reports & analytics'],
  ['channels', '◎', 'القنوات', 'Channels'],
  ['departments', '♧', 'الأقسام وSLA', 'Departments & SLA'],
  ['team', '♧', 'الفريق والصلاحيات', 'Team & roles'],
  ['billing', '◇', 'الاشتراك والاستهلاك', 'Plan & usage'],
  ['branding', '◈', 'هوية الشركة', 'Branding'],
  ['settings', '⚙', 'إعدادات الشركة', 'Workspace settings'],
  ['sessions', '◷', 'جلسات الحساب', 'Account sessions'],
  ['delivery', '⇄', 'التسليم والأحداث', 'Delivery & events'],
  ['audit', '↗', 'سجل النشاط', 'Activity log'],
  ['ai', '✦', 'المساعد الذكي', 'AI assistant'],
];
const navGroups = [
  { ar: '', en: '', keys: ['', 'onboarding'] },
  { ar: 'التواصل', en: 'Engage', keys: ['inbox', 'crm', 'campaigns', 'sequences'] },
  { ar: 'الأتمتة', en: 'Automate', keys: ['flows', 'automations', 'agents', 'knowledge', 'ai'] },
  { ar: 'الإدارة', en: 'Manage', keys: ['channels', 'departments', 'team', 'reports'] },
  {
    ar: 'الحساب',
    en: 'Account',
    keys: ['billing', 'branding', 'settings', 'sessions', 'delivery', 'audit'],
  },
];
const primaryKeys = ['', 'inbox', 'crm', 'flows', 'campaigns', 'sequences', 'channels', 'reports', 'settings'];
const restrictedForAgents = [
  'reports',
  'branding',
  'team',
  'settings',
  'audit',
  'onboarding',
  'campaigns',
  'sequences',
  'automations',
  'agents',
  'departments',
  'delivery',
];
function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const hostBrand = useBrand();
  const { t, toggle } = useLocale();
  const [name, setName] = useState('ELHAFEZ BOAT');
  const [role, setRole] = useState('');
  const [brand, setBrand] = useState<{
    name: string;
    logo_url: string | null;
    primary_color: string;
  } | null>(null);
  const [open, setOpen] = useState(false);
  const [collapsed,setCollapsed] = useState(false);
  useEffect(() => {try {setCollapsed(localStorage.getItem('boat.navigation.collapsed') === 'true');} catch {}}, []);
  const toggleSidebar = () => setCollapsed(value => {const next=!value;try {localStorage.setItem('boat.navigation.collapsed',String(next));} catch {}return next;});
  const [moreOpen, setMoreOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!getSession()) {
      window.location.replace('/login');
      return;
    }
    if (hostBrand)
      setBrand({
        name: hostBrand.name,
        logo_url: hostBrand.logoUrl,
        primary_color: hostBrand.primaryColor,
      });
    if (!hostBrand)
      api<{ enabled: boolean; branding: typeof brand }>('/workspace/branding')
        .then((result) => {
          if (result.enabled) setBrand(result.branding);
        })
        .catch(() => {});
    api<{ tenant: { id: string; name: string }; role: string }>('/workspace')
      .then((w) => {
        if (hostBrand && w.tenant.id !== hostBrand.tenantId)
          throw new Error(
            t('سجّل الدخول إلى مساحة هذا النطاق', 'Sign in to this domain’s workspace'),
          );
        setName(w.tenant.name);
        setRole(w.role);
        setReady(true);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function logout() {
    const s = getSession();
    try {
      if (s)
        await api('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: s.refreshToken }),
        });
    } finally {
      setSession(null);
      window.location.replace('/login');
    }
  }
  const forbidden =
    role === 'agent' &&
    (restrictedForAgents.includes(path.split('/')[2] ?? '') ||
      path.startsWith('/dashboard/inbox/settings'));
  const focused = path.startsWith('/dashboard/inbox') || /^\/dashboard\/flows\/[^/]+$/.test(path);
  return (
    <div
      className={`product-shell ${collapsed ? 'nav-collapsed' : 'nav-expanded'}`}
      style={brand ? ({ '--primary': brand.primary_color } as CSSProperties) : undefined}
    >
      <aside
        id="workspace-navigation"
        className={`product-sidebar ${open ? 'is-open' : ''}`}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      >
        <button
          className="mobile-menu btn"
          aria-label={t('إغلاق القائمة', 'Close navigation')}
          onClick={() => setOpen(false)}
        >
          {t('إغلاق القائمة', 'Close navigation')}
        </button>
        <button type="button" className="sidebar-toggle btn" aria-controls="workspace-navigation" aria-expanded={!collapsed} aria-label={collapsed ? t('توسيع القائمة وإظهار الأقسام','Expand navigation labels') : t('تصغير القائمة','Collapse navigation')} onClick={toggleSidebar}>
          <NavIcon name="menu" /><span>{collapsed ? t('توسيع','Expand') : t('تصغير','Collapse')}</span>
        </button>
        <Link className="brand" href="/dashboard">
          {brand?.logo_url ? (
            <img src={brand.logo_url} alt={brand.name} className="h-10 w-10 object-contain" />
          ) : (
            <span className="brand-mark">B</span>
          )}
          <span>
            {brand?.name || (
              <>
                ELHAFEZ <b>BOAT</b>
              </>
            )}
            <small>{t('منصة المحادثات والأتمتة', 'Messaging & automation')}</small>
          </span>
        </Link>
        <div className="workspace-chip">
          <span className="avatar">{name.slice(0, 1)}</span>
          <div>
            <strong>{name}</strong>
            <small>{role ? statusLabel(role,t) : t('مساحة العمل','Workspace')}</small>
          </div>
        </div>
        <nav aria-label={t('التنقل الرئيسي', 'Main navigation')}>
          {(() => {
            const allowed = (key: string) => role !== 'agent' || !restrictedForAgents.includes(key);
            const isActive = (key: string) =>
              key ? path.startsWith('/dashboard/' + key) : path === '/dashboard';
            const renderLink = ([key, , ar, en]: string[]) => (
              <Link
                onClick={() => {
                  setOpen(false);
                  setMoreOpen(false);
                }}
                key={key}
                title={t(ar, en)}
                href={`/dashboard${key ? '/' + key : ''}`}
                aria-current={isActive(key) ? 'page' : undefined}
                className={isActive(key) ? 'active' : ''}
              >
                <NavIcon name={key} />
                <span className="nav-label">{t(ar, en)}</span>
              </Link>
            );
            const primary = primaryKeys
              .map((key) => links.find(([k]) => k === key))
              .filter((link): link is string[] => !!link && allowed(link[0]));
            const moreGroups = navGroups
              .map((group) => ({
                group,
                items: group.keys
                  .filter((key) => !primaryKeys.includes(key))
                  .map((key) => links.find(([k]) => k === key))
                  .filter((link): link is string[] => !!link && allowed(link[0])),
              }))
              .filter((entry) => entry.items.length);
            const moreActive = moreGroups.some(({ items }) => items.some(([k]) => isActive(k)));
            return (
              <>
                <div className="nav-primary">{primary.map(renderLink)}</div>
                {moreGroups.length > 0 && (
                  <>
                    <button
                      type="button"
                      className={`nav-more-btn ${moreActive ? 'active' : ''}`}
                      aria-expanded={moreOpen}
                      aria-controls="nav-more-panel"
                      title={t('المزيد', 'More')}
                      onClick={() => setMoreOpen(!moreOpen)}
                    >
                      <NavIcon name="more" />
                      <span className="nav-label">{t('المزيد', 'More')}</span>
                    </button>
                    {moreOpen && <div className="nav-more-scrim" onClick={() => setMoreOpen(false)} />}
                    <div
                      id="nav-more-panel"
                      className={`nav-more-panel ${moreOpen ? 'is-open' : ''}`}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setMoreOpen(false);
                      }}
                    >
                      {moreGroups.map(({ group, items }) => (
                        <div key={group.keys.join('|')} role="group">
                          {group.ar && <p className="nav-group">{t(group.ar, group.en)}</p>}
                          {items.map(renderLink)}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            );
          })()}
        </nav>
        <div className="sidebar-footer">
          <button
            onClick={() => {
              toggle();
              setOpen(false);
            }}
          >
            العربية / English
          </button>
          <button onClick={logout}>{t('تسجيل الخروج', 'Sign out')}</button>
        </div>
      </aside>
      <div className="product-content">
        <header className="product-topbar">
          <button
            className="mobile-menu"
            aria-expanded={open}
            aria-controls="workspace-navigation"
            aria-label={t('فتح القائمة', 'Open navigation')}
            onClick={() => setOpen(!open)}
          >
            <NavIcon name="menu" />
          </button>
          <WorkspaceMenu name={name} />
          <span className="badge">{t('بيئة العمل', 'Workspace')}</span>
        </header>
        {error ? (
          <div className="notice error" role="alert">
            {error}
            <button className="btn" onClick={() => void logout()}>
              {t('تسجيل خروج وتغيير الحساب', 'Sign out and change account')}
            </button>
            <button onClick={() => window.location.reload()}>{t('إعادة المحاولة', 'Retry')}</button>
          </div>
        ) : !ready ? (
          <p className="page-loading" role="status">
            {t('جارٍ تحميل مساحة العمل…', 'Loading workspace…')}
          </p>
        ) : (
          <div className={focused ? 'focused-workspace' : 'page-workspace'}>
            {forbidden ? (
              <section className="card stack" role="alert">
                <h1>
                  {t('هذه الصفحة تحتاج صلاحيات إدارية', 'This page requires management access')}
                </h1>
                <p>
                  {t(
                    'استخدم صندوق الوارد أو تواصل مع مالك مساحة العمل.',
                    'Use Inbox or contact the workspace owner.',
                  )}
                </p>
                <Link className="btn" href="/dashboard/inbox">
                  {t('فتح صندوق الوارد', 'Open Inbox')}
                </Link>
              </section>
            ) : (
              children
            )}
          </div>
        )}
      </div>
    </div>
  );
}
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
