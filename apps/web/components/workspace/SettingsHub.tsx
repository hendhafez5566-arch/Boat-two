'use client';
import Link from 'next/link';
import {useData} from '../business/useData';
import { useEffect,useRef, useState } from 'react';
import { useLocale } from '../product/locale';
import { NavIcon } from '../product/NavIcon';
import Sessions from './SessionsPanel';
import Audit from './AuditPanel';
import Integrations from './IntegrationsPanel';
import CompanySettings from './CompanySettings';
import { AccountWorkspaceContext } from '../product/AccountWorkspaceContext';
import styles from './settings-hub.module.css';
export default function SettingsHub() {
  const { t } = useLocale();
  const workspace=useData<{role:string}>('/workspace',{role:''});
  const canManageFiles=['owner','admin'].includes(workspace.data.role);
  const draft=useRef({dirty:false,busy:false});
  const mayLeave=()=>!draft.current.busy&&(!draft.current.dirty||window.confirm(t('تجاهل تغييرات الإعدادات غير المحفوظة؟','Discard unsaved settings changes?')));
  useEffect(()=>{const unload=(e:BeforeUnloadEvent)=>{if(draft.current.dirty||draft.current.busy){e.preventDefault();e.returnValue='';}};const click=(e:MouseEvent)=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;const a=(e.target as Element)?.closest?.('a[href]') as HTMLAnchorElement|null;if(!a||a.target==='_blank'||a.download||a.href===location.href)return;if(!mayLeave()){e.preventDefault();e.stopPropagation();}};window.addEventListener('beforeunload',unload);document.addEventListener('click',click,true);return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',click,true);};},[t]);
  const [tab, setTab] = useState('security');
  const [security, setSecurity] = useState('devices');
  useEffect(() => {
    const read = () => {
      const query = new URLSearchParams(window.location.search);
      const value = query.get('tab') || query.get('action');
      setSecurity(query.get('security')==='activity'?'activity':'devices');
      setTab(
        [
          'integrations',
          'email-tab',
          'sms-tab',
          'emailauto-tab',
          'salla-tab',
          'thirdparty-api-tab',
        ].includes(value || '')
          ? 'integrations'
          : value === 'company'
            ? 'company'
            : 'security',
      );
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  const select = (value: string) => {
    if(value!==tab&&!mayLeave())return;
    if(value!==tab)draft.current={dirty:false,busy:false};
    setTab(value);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', value);
    url.searchParams.delete('action');
    window.history.replaceState(window.history.state, '', url.pathname + url.search);
  };
  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div className={styles.heroTitle}><span className={styles.heroIcon}><NavIcon name="settings"/></span><div><h1>{t('الإعدادات والتكاملات', 'Settings & Integration')}</h1><p>{t('إدارة مساحة العمل والأمان والاتصالات الخارجية','Manage your workspace, security and connections')}</p></div></div>
        {workspace.error&&<p role="alert" className="notice error">{workspace.error} <button className="btn" onClick={()=>void workspace.reload()}>{t('إعادة المحاولة','Retry')}</button></p>}
        {canManageFiles&&<Link className="btn" href="/dashboard/settings/attachments"><NavIcon name="folder"/>{t('إدارة المرفقات','Attachment management')}</Link>}
      </header>
      <div className={styles.layout}>
        <nav
          className={styles.navigation}
          role="tablist"
          aria-label={t('أقسام الإعدادات', 'Settings sections')}
        >
          <button role="tab" aria-selected={tab === 'company'} onClick={() => select('company')}>
            <NavIcon name="settings" />
            {t('الشركة', 'Company')}
            <small>{t('بيانات مساحة العمل', 'Workspace details')}</small>
          </button>
          <button role="tab" aria-selected={tab === 'security'} onClick={() => select('security')}>
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
            tab === 'company'
              ? t('الشركة', 'Company')
              : tab === 'integrations'
                ? t('تكاملات API', 'API Integration')
                : t('الأمان', 'Security')
          }
        >
          <header>
            <span className={styles.heroIcon}><NavIcon name={tab==='company'?'settings':tab==='integrations'?'integrations':'shield'}/></span><h2>
              {tab === 'company'
                ? t('بيانات الشركة', 'Company details')
                : tab === 'integrations'
                  ? t('تكاملات API', 'API Integration')
                  : t('الأمان', 'Security')}
            </h2>
          </header>
          <AccountWorkspaceContext.Provider value={true}>
            {tab === 'company' ? (
              <CompanySettings onDraftState={(dirty,busy)=>{draft.current={dirty,busy};}} />
            ) : tab === 'integrations' ? (
              canManageFiles?<Integrations onDraftState={(dirty,busy)=>{draft.current={dirty,busy};}} />:<p className="notice">{workspace.loading?t('جارٍ التحقق من الصلاحيات…','Checking permissions…'):t('يتطلب إدارة التكاملات صلاحية المسؤول.','Integration management requires administrator access.')}</p>
            ) : (
              <div className={styles.security}>
                <nav
                  className={styles.subnav}
                  role="tablist"
                  aria-label={t('إعدادات الأمان', 'Security settings')}
                >
                  <button
                    role="tab"
                    aria-selected={security === 'devices'}
                    onClick={() => {
                      select('security');
                      setSecurity('devices');const url=new URL(location.href);url.searchParams.set('security','devices');history.replaceState(history.state,'',url.pathname+url.search);
                    }}
                  >
                    <NavIcon name="sessions" />
                    {t('الأجهزة المتصلة', 'Logged-In Devices')}
                    <small>{t('الجلسات', 'Sessions')}</small>
                  </button>
                  <button
                    role="tab"
                    aria-selected={security === 'activity'}
                    onClick={() => {
                      select('security');
                      setSecurity('activity');const url=new URL(location.href);url.searchParams.set('security','activity');history.replaceState(history.state,'',url.pathname+url.search);
                    }}
                  >
                    <NavIcon name="audit" />
                    {t('سجل النشاط', 'Activity Logs')}
                    <small>{t('السجلات', 'Logs')}</small>
                  </button>
                </nav>
                <div className={styles.panel}>
                  {security === 'devices' ? <Sessions /> : canManageFiles?<Audit />:<p className="notice">{workspace.loading?t('جارٍ التحقق من الصلاحيات…','Checking permissions…'):t('سجل النشاط متاح للمسؤولين.','Activity logs require administrator access.')}</p>}
                </div>
              </div>
            )}
          </AccountWorkspaceContext.Provider>
        </section>
      </div>
    </main>
  );
}
