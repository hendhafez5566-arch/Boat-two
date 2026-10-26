'use client';
import { useEffect, useState } from 'react';
import { useLocale } from '../product/locale';
import { NavIcon } from '../product/NavIcon';
import WorkspaceSettings from './WorkspaceSettingsPanel';
import Sessions from './SessionsPanel';
import Audit from './AuditPanel';
import Integrations from './IntegrationsPanel';
import { AccountWorkspaceContext } from '../product/AccountWorkspaceContext';
import styles from './settings-hub.module.css';
export default function SettingsHub() {
  const { t } = useLocale();
  const [tab, setTab] = useState('security');
  const [security, setSecurity] = useState('devices');
  useEffect(() => {
    const read = () => {
      const query = new URLSearchParams(window.location.search);
      const value = query.get('tab') || query.get('action');
      setTab(
        value === 'workspace'
          ? 'workspace'
          : value && value !== 'security' && value !== 'security-tab'
            ? 'integrations'
            : 'security',
      );
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  const select = (value: string) => {
    setTab(value);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', value);
    url.searchParams.delete('action');
    window.history.replaceState(window.history.state, '', url.pathname + url.search);
  };
  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <h1>{t('الإعدادات والتكاملات', 'Settings & Integration')}</h1>
        <p>{t('الإعدادات وتكاملات API', 'Settings and API Integration')}</p>
      </header>
      <div className={styles.layout}>
        <nav
          className={styles.navigation}
          role="tablist"
          aria-label={t('أقسام الإعدادات', 'Settings sections')}
        >
          <button
            role="tab"
            aria-selected={tab === 'security' || tab === 'workspace'}
            onClick={() => select('security')}
          >
            <NavIcon name="shield" />
            {t('الأمان', 'Security')}
            <small>{t('الإعدادات', 'Settings')}</small>
          </button>
          <button
            role="tab"
            aria-selected={tab === 'integrations'}
            onClick={() => select('integrations')}
          >
            <NavIcon name="integrations" />
            {t('تكاملات API', 'API Integration')}
            <small>{t('التكاملات', 'Integration')}</small>
          </button>
        </nav>
        <section
          className={styles.content}
          role="tabpanel"
          aria-label={
            tab === 'integrations' ? t('تكاملات API', 'API Integration') : t('الأمان', 'Security')
          }
        >
          <header>
            <h2>
              {tab === 'integrations'
                ? t('تكاملات API', 'API Integration')
                : t('الأمان', 'Security')}
            </h2>
            <p>{t('الإعدادات', 'Settings')}</p>
          </header>
          <AccountWorkspaceContext.Provider value={true}>
            {tab === 'integrations' ? (
              <Integrations />
            ) : (
              <div className={styles.security}>
                <nav
                  className={styles.subnav}
                  role="tablist"
                  aria-label={t('إعدادات الأمان', 'Security settings')}
                >
                  <button
                    role="tab"
                    aria-selected={tab !== 'workspace' && security === 'devices'}
                    onClick={() => {
                      select('security');
                      setSecurity('devices');
                    }}
                  >
                    <NavIcon name="sessions" />
                    {t('الأجهزة المتصلة', 'Logged-In Devices')}
                    <small>{t('الجلسات', 'Sessions')}</small>
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab !== 'workspace' && security === 'activity'}
                    onClick={() => {
                      select('security');
                      setSecurity('activity');
                    }}
                  >
                    <NavIcon name="audit" />
                    {t('سجل النشاط', 'Activity Logs')}
                    <small>{t('السجلات', 'Logs')}</small>
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === 'workspace'}
                    onClick={() => select('workspace')}
                  >
                    <NavIcon name="settings" />
                    {t('إعدادات الشركة', 'Workspace Settings')}
                    <small>{t('الإعدادات', 'Settings')}</small>
                  </button>
                </nav>
                <div className={styles.panel}>
                  {tab === 'workspace' ? (
                    <WorkspaceSettings />
                  ) : security === 'devices' ? (
                    <Sessions />
                  ) : (
                    <Audit />
                  )}
                </div>
              </div>
            )}
          </AccountWorkspaceContext.Provider>
        </section>
      </div>
    </main>
  );
}
