'use client';
import { SalesNotifications } from '../../components/business/SalesNotifications';
import { statusLabel } from '../../components/product/status';
import { NavIcon } from '../../components/product/NavIcon';
import { CSSProperties, ReactNode, useEffect, useId, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, getSession, setSession } from '../../lib/api';
import { useBrand } from '../../components/product/BrandContext';
import { useLocale } from '../../components/product/locale';
const navigation = [
  {
    label: ['مساحة العمل', 'Workspace'],
    links: [
      ['', 'لوحة المعلومات', 'Dashboard'],
      ['inbox', 'صندوق الوارد المشترك', 'Shared Inbox'],
      ['crm', 'إدارة العملاء', 'CRM'],
      ['commerce', 'المنتجات', 'Products'],
      ['reports', 'التقارير', 'Reports'],
    ],
  },
  {
    label: ['البوت والحملات', 'Bots & campaigns'],
    links: [
      ['channels', 'قنوات الاتصال', 'Channels'],
      ['flows', 'مدير البوت', 'Bot Manager'],
      ['campaigns', 'الحملات', 'Campaigns'],
      ['sequences', 'التسلسلات', 'Sequences'],
      ['automations', 'الأتمتة', 'Automations'],
      ['social', 'النشر الاجتماعي', 'Social Posting'],
    ],
  },
  {
    label: ['الذكاء الاصطناعي', 'AI workspace'],
    links: [
      ['agents', 'المساعدون', 'AI Agents'],
      ['knowledge', 'قاعدة المعرفة', 'Knowledge Base'],
    ],
  },
  {
    label: ['الإدارة', 'Administration'],
    links: [
      ['team', 'الفريق', 'Team'],
      ['packages', 'الباقات', 'Packages'],
      ['billing', 'الفوترة', 'Billing'],
      ['settings', 'الإعدادات والتكاملات', 'Settings & Integration'],
      ['onboarding', 'دليل البداية', 'Getting Started'],
    ],
  },
];
const links = navigation.flatMap((group) => group.links);
const destination = (key: string) =>
  key === 'crm' ? '/dashboard/crm/today' : `/dashboard${key ? '/' + key : ''}`;
const restrictedForAgents = [
  'channels',
  'social',
  'packages',
  'commerce',
  'integrations',
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
function Meter({
  label,
  used,
  limit,
  href,
}: {
  label: string;
  used?: string | number;
  limit?: number;
  href: string;
}) {
  const u = Number(used ?? 0) || 0;
  const unlimited = limit === -1;
  const pct =
    typeof limit === 'number' && Number.isFinite(limit) && limit > 0
      ? Math.min(100, Math.round((u / limit) * 100))
      : null;
  const tone = pct !== null && pct >= 90 ? 'is-danger' : pct !== null && pct >= 70 ? 'is-warn' : '';
  return (
    <Link
      className={`bs-meter ${tone}`}
      href={href}
      title={`${label}: ${used ?? '—'} / ${unlimited ? '∞' : (limit ?? '—')}`}
    >
      <span className="bs-ring" style={{ '--p': pct ?? 0 } as CSSProperties}>
        <b>{unlimited ? '∞' : pct === null ? '—' : `${pct}%`}</b>
      </span>
      <span className="bs-meter-text">
        <small>{label}</small>
        <strong>
          {used ?? '—'}/{unlimited ? '∞' : (limit ?? '—')}
        </strong>
      </span>
    </Link>
  );
}
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
  const [usage, setUsage] = useState<Record<string, string | number>>({});
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [aiEnabled, setAiEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const update = () => {
      setMobile(media.matches);
      if (!media.matches) setOpen(false);
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const [collapsed, setCollapsed] = useState(false);
  const compactWorkspace = path === '/dashboard/flows' || path.startsWith('/dashboard/crm');
  const [workspaceExpanded, setWorkspaceExpanded] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('boat.navigation.collapsed') === 'true');
    } catch {
      /* Device preferences are optional. */
    }
  }, []);
  const toggleSidebar = () =>
    compactWorkspace
      ? setWorkspaceExpanded((value) => !value)
      : setCollapsed((value) => {
          const next = !value;
          try {
            localStorage.setItem('boat.navigation.collapsed', String(next));
          } catch {
            /* Device preferences are optional. */
          }
          return next;
        });
  const [acctOpen, setAcctOpen] = useState(false);
  const [q, setQ] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const searchId = useId();
  const router = useRouter();
  const acctRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!acctOpen) return;
    const close = (e: MouseEvent) => {
      if (!acctRef.current?.contains(e.target as Node)) setAcctOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [acctOpen]);
  useEffect(() => {
    setAcctOpen(false);
    setQ('');
    setOpen(false);
    setWorkspaceExpanded(false);
  }, [path]);
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
    api<{
      tenant: { id: string; name: string };
      role: string;
      usage: Record<string, string | number>;
      plan: { limits: Record<string, number> };
      aiEnabled: boolean;
    }>('/workspace')
      .then((w) => {
        if (hostBrand && w.tenant.id !== hostBrand.tenantId)
          throw new Error(
            t('سجّل الدخول إلى مساحة هذا النطاق', 'Sign in to this domain’s workspace'),
          );
        setName(w.tenant.name);
        setUsage(w.usage);
        setLimits(w.plan.limits);
        setAiEnabled(w.aiEnabled);
        setRole(w.role);
        setReady(true);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let active = true;
    let revision = 0;
    const refreshUsage = async () => {
      const current = ++revision;
      try {
        const result = await api<{
          usage: Record<string, string | number>;
          plan: { limits: Record<string, number> };
        }>('/workspace');
        if (active && current === revision) {
          setUsage(result.usage);
          setLimits(result.plan.limits);
        }
      } catch {
        // An unavailable count is clearer than presenting an old count as current.
        if (active && current === revision) setUsage({});
      }
    };
    void refreshUsage();
    window.addEventListener('boat:crm-changed', refreshUsage);
    window.addEventListener('boat:crm-imported', refreshUsage);
    return () => {
      active = false;
      window.removeEventListener('boat:crm-changed', refreshUsage);
      window.removeEventListener('boat:crm-imported', refreshUsage);
    };
  }, [path]);
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
      path.startsWith('/dashboard/inbox/settings') ||
      path.startsWith('/dashboard/flows/'));
  const isInbox = path === '/dashboard/inbox';
  useEffect(() => {
    const show = () => setOpen((value) => !value);
    window.addEventListener('boat:toggle-navigation', show);
    return () => window.removeEventListener('boat:toggle-navigation', show);
  }, []);
  const isFlowEditor = /^\/dashboard\/flows\/(?!new$)[^/]+$/.test(path);
  const compactNavigation = compactWorkspace ? !workspaceExpanded : collapsed;
  const focused = isInbox || /^\/dashboard\/flows\/[^/]+$/.test(path);
  const allowedKey = (key: string) => role !== 'agent' || !restrictedForAgents.includes(key);
  const isActive = (key: string) =>
    key
      ? path === '/dashboard/' + key || path.startsWith('/dashboard/' + key + '/')
      : path === '/dashboard';
  const searchHits = q.trim()
    ? links
        .filter(
          ([k, ar, en]) =>
            allowedKey(k) && (ar + ' ' + en).toLowerCase().includes(q.trim().toLowerCase()),
        )
        .slice(0, 8)
    : [];
  const accountLinks = [
    ['account', 'user', 'الحساب', 'Account'],
    ['billing', 'billing', 'الفوترة', 'Billing'],
    ['sessions', 'shield', 'الأمان', 'Security'],
    ['pricing', 'upgrade', 'الترقية إلى Pro', 'Upgrade to Pro'],
    ['support', 'support', 'تذاكر الدعم', 'Support Ticket'],
    ['developer', 'developer', 'API للمطور', 'API Developer'],
  ].filter(([k]) => allowedKey(k));
  return (
    <div
      className={`product-shell bs-shell ${isInbox ? 'inbox-shell' : ''} ${isFlowEditor ? 'flow-shell' : ''} ${(compactNavigation && !isInbox) || isFlowEditor ? 'nav-collapsed' : 'nav-expanded'}`}
      style={brand ? ({ '--primary': brand.primary_color } as CSSProperties) : undefined}
    >
      {open && <div className="bs-scrim" aria-hidden="true" onClick={() => setOpen(false)} />}
      <aside
        id="workspace-navigation"
        className={`product-sidebar ${open ? 'is-open' : ''}`}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      >
        <button
          className="mobile-menu btn bs-close"
          aria-label={t('إغلاق القائمة', 'Close navigation')}
          onClick={() => setOpen(false)}
        >
          <NavIcon name="close" />
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
                BOAT <b>TWO</b>
              </>
            )}
          </span>
        </Link>
        <nav aria-label={t('التنقل الرئيسي', 'Main navigation')}>
          {navigation.map(({ label: [ar, en], links }) => {
            const visible = links.filter(([key]) => allowedKey(key));
            if (!visible.length) return null;
            return (
              <section key={en} className="workspace-nav-group" aria-label={t(ar, en)}>
                <h2>{t(ar, en)}</h2>
                {visible.map(([key, titleAr, titleEn]) => (
                  <Link
                    key={key}
                    href={destination(key)}
                    title={t(titleAr, titleEn)}
                    aria-label={t(titleAr, titleEn)}
                    aria-current={isActive(key) ? 'page' : undefined}
                    className={isActive(key) ? 'active' : ''}
                    onClick={() => setOpen(false)}
                  >
                    <NavIcon name={key || 'grid'} />
                    <span className="nav-label">{t(titleAr, titleEn)}</span>
                  </Link>
                ))}
              </section>
            );
          })}
        </nav>
      </aside>
      <div className="product-content">
        {!isFlowEditor && !isInbox && (
          <header className="product-topbar bs-topbar">
            <button
              className="bs-iconbtn bs-burger"
              aria-expanded={mobile ? open : !compactNavigation}
              aria-controls="workspace-navigation"
              aria-label={t('القائمة', 'Navigation')}
              onClick={() => {
                if (mobile) setOpen(!open);
                else toggleSidebar();
              }}
            >
              <NavIcon name="menu" />
            </button>
            <div className="bs-meters usage-strip">
              <Meter
                label={t('عملاء', 'Contacts')}
                used={usage.contacts}
                limit={limits.contacts}
                href="/dashboard/crm"
              />
              <Meter
                label={t('رسائل', 'Messages')}
                used={usage.messages_per_month}
                limit={limits.messages_per_month}
                href="/dashboard/billing"
              />
              {aiEnabled && (
                <Meter
                  label="AI Token"
                  used={usage.ai_tokens}
                  limit={limits.ai_tokens}
                  href="/dashboard/billing"
                />
              )}
            </div>
            <div className="bs-spacer" />
            <div className="bs-search" role="search">
              <NavIcon name="search" />
              <input
                type="search"
                value={q}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={searchHits.length > 0}
                aria-controls={searchHits.length ? searchId : undefined}
                aria-activedescendant={
                  searchHits[searchIndex] ? `${searchId}-${searchIndex}` : undefined
                }
                aria-label={t('بحث في القوائم', 'Search menus')}
                placeholder={t('ابحث في القوائم…', 'Search menus…')}
                onChange={(e) => {
                  setQ(e.target.value);
                  setSearchIndex(0);
                }}
                onKeyDown={(e) => {
                  if (['ArrowDown', 'ArrowUp'].includes(e.key) && searchHits.length) {
                    e.preventDefault();
                    setSearchIndex(
                      (i) =>
                        (i + (e.key === 'ArrowDown' ? 1 : -1) + searchHits.length) %
                        searchHits.length,
                    );
                  }
                  if (e.key === 'Enter' && searchHits[searchIndex]) {
                    e.preventDefault();
                    const key = searchHits[searchIndex][0];
                    router.push(destination(key));
                  }
                  if (e.key === 'Escape') setQ('');
                }}
              />
              {searchHits.length > 0 && (
                <div
                  id={searchId}
                  className="bs-search-results"
                  role="listbox"
                  aria-label={t('نتائج البحث', 'Search results')}
                >
                  {searchHits.map(([k, ar, en], index) => (
                    <Link
                      key={k}
                      href={destination(k)}
                      role="option"
                      id={`${searchId}-${index}`}
                      aria-selected={index === searchIndex}
                      onMouseEnter={() => setSearchIndex(index)}
                    >
                      <NavIcon name={k} />
                      {t(ar, en)}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <SalesNotifications compact />
            <div className="account-actions bs-account" ref={acctRef}>
              <button
                type="button"
                className="bs-avatar"
                aria-haspopup="menu"
                aria-expanded={acctOpen}
                aria-label={t('قائمة الحساب', 'Account menu')}
                title={name}
                onClick={() => setAcctOpen(!acctOpen)}
              >
                {brand?.logo_url ? (
                  <img src={brand.logo_url} alt="" />
                ) : (
                  <span>{name.slice(0, 1)}</span>
                )}
              </button>
              {acctOpen && (
                <div
                  className="bs-menu"
                  role="menu"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setAcctOpen(false);
                      acctRef.current?.querySelector<HTMLButtonElement>('.bs-avatar')?.focus();
                    }
                  }}
                >
                  <div className="bs-menu-head">
                    <strong>{name}</strong>
                    <small>{role ? statusLabel(role, t) : t('مساحة العمل', 'Workspace')}</small>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      toggle();
                      setAcctOpen(false);
                    }}
                  >
                    <NavIcon name="globe" /> العربية / English
                  </button>
                  {accountLinks.map(([k, icon, ar, en], i) => (
                    <Link
                      key={k + i}
                      role="menuitem"
                      href={'/dashboard/' + k}
                      className={icon === 'upgrade' ? 'is-strong' : ''}
                      onClick={() => setAcctOpen(false)}
                    >
                      <NavIcon name={icon} />
                      {t(ar, en)}
                    </Link>
                  ))}
                  <button
                    type="button"
                    role="menuitem"
                    className="is-danger"
                    onClick={() => void logout()}
                  >
                    <NavIcon name="logout" />
                    {t('تسجيل الخروج', 'Logout')}
                  </button>
                </div>
              )}
            </div>
          </header>
        )}
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
          <div
            className={
              isFlowEditor
                ? 'flow-editor-workspace'
                : focused
                  ? 'focused-workspace'
                  : 'page-workspace'
            }
          >
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
