'use client';
import { useState } from 'react';
import { useLocale } from '../product/locale';
import WorkspaceSettings from './WorkspaceSettingsPanel';
import Sessions from './SessionsPanel';
import Integrations from './IntegrationsPanel';
import { AccountWorkspaceContext } from '../product/AccountWorkspaceContext';
import styles from '../business/broadcast.module.css';
export default function SettingsHub() {
  const { t } = useLocale();
  const [tab, setTab] = useState('security');
  return (
    <main className={styles.page}>
      <header className="page-heading">
        <div>
          <h1>{t('الإعدادات والتكاملات', 'Settings & Integration')}</h1>
          <p>
            {t(
              'الأمان وإعدادات الشركة وربط الخدمات من مكان واحد.',
              'Security, workspace preferences and API connections in one place.',
            )}
          </p>
        </div>
      </header>
      <nav className={styles.mode} aria-label={t('أقسام الإعدادات', 'Settings sections')}>
        {[
          ['security', 'إعدادات الأمان', 'Security'],
          ['workspace', 'إعدادات الشركة', 'Workspace'],
          ['integrations', 'تكاملات API', 'API Integration'],
        ].map(([key, ar, en]) => (
          <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>
            {t(ar, en)}
          </button>
        ))}
      </nav>
      <AccountWorkspaceContext.Provider value={true}>
        {tab === 'security' ? (
          <Sessions />
        ) : tab === 'workspace' ? (
          <WorkspaceSettings />
        ) : (
          <Integrations />
        )}
      </AccountWorkspaceContext.Provider>
    </main>
  );
}
