'use client';
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
  const focused = path.startsWith('/dashboard/inbox') || /^\/dashboard\/flows\/[^/]+$/.test(path);
  return (
    <div
      className="product-shell"
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
            <small>{role || t('مساحة العمل', 'Workspace')}</small>
          </div>
        </div>
        <nav aria-label={t('التنقل الرئيسي', 'Main navigation')}>
          {links
            .filter(
              ([key]) =>
                role !== 'agent' ||
                ![
                  'reports',
                  'branding',
                  'team',
                  'settings',
                  'audit',
                  'onboarding',
                  'campaigns',
                  'automations',
                  'agents',
                  'departments',
                  'delivery',
                ].includes(key),
            )
            .map(([key, , ar, en]) => (
              <Link
                onClick={() => setOpen(false)}
                key={key}
                href={`/dashboard${key ? '/' + key : ''}`}
                className={
                  key
                    ? path.startsWith('/dashboard/' + key)
                      ? 'active'
                      : ''
                    : path === '/dashboard'
                      ? 'active'
                      : ''
                }
              >
                <NavIcon name={key} />
                {t(ar, en)}
              </Link>
            ))}
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
          <div className={focused ? 'focused-workspace' : 'page-workspace'}>{children}</div>
        )}
      </div>
    </div>
  );
}
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
