'use client';
import { DisclosureSummary } from '../../../components/product/DisclosureSummary';

import { useEffect, useState } from 'react';
import ChannelLogo from '../../../components/product/ChannelLogo';
import { NavIcon } from '../../../components/product/NavIcon';
import Link from 'next/link';
import ChannelCatalog from '../../../components/product/ChannelCatalog';
import ChannelSettings from '../../../components/product/ChannelSettings';
import { useLocale } from '../../../components/product/locale';
import { statusLabel } from '../../../components/product/status';
import { Dialog } from '../../../components/product/ProductUI';
import { api, getSession } from '../../../lib/api';
import { channelHref } from '../../../lib/channel-context';
import styles from './channels.module.css';
import {
  channelConnectionState,
  connectionAccountCounts,
  filterConnectionAccounts,
} from '../../../lib/channel-overview';

type BotReadiness = {
  active: boolean;
  publishedFlowCount: number;
  flowTriggers: {
    name: string;
    types: string[];
    draftSteps: number;
    publishedSteps: number;
    publishedReplies: number;
    matchesTestKeyword: boolean;
  }[];
  activeConversationsBot: number;
  activeConversationsHuman: number;
  recentBotReplies: number;
  recentSent: number;
  recentBlocked: number;
  recentFailed: number;
  previewBotEnabled: boolean;
  previewConversation: null | {
    handledBy: string;
    status: string;
    lastInboundAt: string | null;
    sessionStatus: string | null;
    sessionWaitKind: string | null;
    sessionCreatedAt: string | null;
    pendingInboundEvents: number;
    restartFlowName: string | null;
    selectedFlowId: string | null;
    restartEligible: boolean;
    lastBotReply: null | {
      createdAt: string;
      status: string;
      jobStatus: string | null;
      category: string;
      code: string | null;
    };
  };
};

type WhatsAppAuthDiagnostics = {
  token: {
    status: 'granted' | 'missing_permission' | 'invalid_token' | 'wrong_app' | 'unknown';
    expiresAt: string | null;
    dataAccessExpiresAt?: string | null;
    managementGranted?: boolean;
    tokenType?: string | null;
    reason: string;
  };
  recentFailures: {
    createdAt: string;
    messageStatus: string;
    jobStatus: string | null;
    category: 'authentication' | 'permission' | 'provider_limit' | 'delivery_blocked' | 'other';
    code: string | null;
  }[];
  checkedAt: string;
  connectionHealth?: Channel['connectionHealth'];
};

type Channel = {
  id: string;
  type: string;
  name: string;
  external_id: string;
  status: string;
  created_at?: string;
  widgetSnippet?: string;
  settings?: Record<string, unknown>;
  connectionHealth?: { state: string; checkedAt: string | null; reason: string };
};

const CHANNEL_NAMES: Record<string, string> = {
  google: 'Google',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  telegram: 'Telegram',
  web: 'Webchat',
};
export default function Channels() {
  const { t, language } = useLocale();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<Channel | null>(null);
  const [widget, setWidget] = useState<Channel | null>(null);
  const [copied, setCopied] = useState('');
  const [items, setItems] = useState<Channel[]>([]);
  const [google, setGoogle] = useState<Channel[]>([]);
  const accounts = [...items, ...google];
  const [botDiagnostics, setBotDiagnostics] = useState<Record<string, BotReadiness>>({});
  const [authDiagnostics, setAuthDiagnostics] = useState<Record<string, WhatsAppAuthDiagnostics>>(
    {},
  );
  const [editingTokenId, setEditingTokenId] = useState<string | null>(null);
  const [replacementToken, setReplacementToken] = useState('');
  const [tokenNotice, setTokenNotice] = useState('');

  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [availableOpen, setAvailableOpen] = useState(false);
  const [platform, setPlatform] = useState('all');
  const [department,setDepartment]=useState('all');
  const [view,setView]=useState<'cards'|'list'>('cards');
  const [detailTab,setDetailTab]=useState<'overview'|'identity'|'health'|'templates'|'advanced'>('overview');
  const [role,setRole]=useState('');
  const [savedNotice,setSavedNotice]=useState('');
  const [identityBusy,setIdentityBusy]=useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const stateOf = channelConnectionState;
  const counts = connectionAccountCounts(accounts);
  const stateLabels: Record<string, string> = {
    attention: t('تحتاج إجراء (الكل)', 'All needing attention'),
    connected: t('متصل', 'Connected'),
    expiring: t('ينتهي قريبًا', 'Expiring soon'),
    needs_action: t('يحتاج إجراء', 'Needs action'),
    expired: t('تفويض منتهٍ', 'Authorization expired'),
    disconnected: t('متوقف', 'Disconnected'),
  };
  const canManage=role==='owner'||role==='admin';
  const phoneOf=(c:Channel)=>typeof c.settings?.providerDisplayPhone==='string'?c.settings.providerDisplayPhone:'';
  const deptOf=(c:Channel)=>typeof c.settings?.displayDepartment==='string'?c.settings.displayDepartment:'';
  const departments=Array.from(new Set(accounts.map(deptOf).filter(Boolean))).sort();
  const query=search.trim().toLocaleLowerCase();
  const visible=filterConnectionAccounts(accounts,platform,filter,'').filter(c=>(department==='all'||(department==='none'?!deptOf(c):deptOf(c)===department))&&(!query||[c.name,c.type,phoneOf(c),deptOf(c)].join(' ').toLocaleLowerCase().includes(query)||(/^\+?[\d\s().-]+$/.test(query)&&phoneOf(c).replace(/\D/g,'').includes(query.replace(/\D/g,'')))));
  const selected=accounts.find(c=>c.id===expandedId);
  const formatDate=(value?:string|null)=>value?new Date(value).toLocaleString(language==='ar'?'ar-EG':'en-GB'):'—';
  function openChannel(c:Channel|null,tab:typeof detailTab='overview'){
    setExpandedId(c?.id??null);setDetailTab(tab);setError('');setSavedNotice('');setEditingTokenId(null);setReplacementToken('');
    const url=new URL(window.location.href);if(c)url.searchParams.set('manage',c.id);else url.searchParams.delete('manage');window.history.pushState(null,'',url.toString());window.scrollTo({top:0,behavior:'instant'});
  }
  async function refreshPhone(c:Channel){
    setIdentityBusy(true);setError('');setSavedNotice('');
    try{const row=await api<Channel>(`/channels/${c.id}/phone-identity`,{method:'POST'});setItems(rows=>rows.map(old=>old.id===row.id?row:old));setSavedNotice(t('تم تحديث رقم واتساب من Meta','WhatsApp number refreshed from Meta'));}
    catch(e){setError((e as Error).message);}finally{setIdentityBusy(false);}
  }
  async function saveIdentity(event:React.FormEvent<HTMLFormElement>,c:Channel){
    event.preventDefault();if(identityBusy||!canManage)return;const f=new FormData(event.currentTarget);setIdentityBusy(true);setError('');setSavedNotice('');
    try{const row=await api<Channel>(`/channels/${c.id}`,{method:'PATCH',body:JSON.stringify({name:String(f.get('name')||'').trim(),settings:{displayDepartment:String(f.get('department')||'').trim(),internalNote:String(f.get('note')||'').trim()}})});setItems(rows=>rows.map(old=>old.id===row.id?row:old));setSavedNotice(t('تم حفظ بيانات القناة','Channel details saved'));}
    catch(e){setError((e as Error).message);}finally{setIdentityBusy(false);}
  }
  async function copyPhone(c:Channel){try{await navigator.clipboard.writeText(phoneOf(c));setCopied(c.id+'-phone');}catch{setError(t('تعذر النسخ؛ يمكنك تحديد الرقم ونسخه','Could not copy; select the number manually'));}}
  const platformName=(c:Channel)=>c.type==='whatsapp'?'WhatsApp Business':CHANNEL_NAMES[c.type]||c.type;
  const healthText=(c:Channel)=>c.connectionHealth?.reason==='widget_installation_required'?t('يحتاج تثبيت أداة الدردشة','Widget installation required'):stateLabels[stateOf(c)]||t('غير معروف','Unknown');
  const install=(c:Channel)=>{setCopied('');setWidget(c);};
  async function verify(c: Channel) {
    setBusy(true);
    setError('');
    try {
      const health = await api<NonNullable<Channel['connectionHealth']>>(
        `/channels/${c.id}/verify`,
        { method: 'POST' },
      );
      setItems((rows) =>
        rows.map((row) => (row.id === c.id ? { ...row, connectionHealth: health } : row)),
      );
      if(c.type==='whatsapp'&&!phoneOf(c)) await refreshPhone(c);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function inspectBot(c: Channel) {
    setBusy(true);
    setError('');
    try {
      const result = await api<BotReadiness>(`/channels/${c.id}/bot-readiness`);
      setBotDiagnostics((prev) => ({ ...prev, [c.id]: result }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function restartPreviewBot(c: Channel) {
    if (
      !window.confirm(
        t(
          'سيتم إرجاع محادثة الاختبار وحدها إلى البوت وإنهاء أي سؤال منتظر قديم. المحادثات الأخرى لن تتأثر. هل تريد المتابعة؟',
          'Return ONLY the preview conversation to the bot and expire any old waiting step? Other conversations stay unchanged.',
        ),
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      await api(`/channels/${c.id}/preview-restart`, {
        method: 'POST',
        body: JSON.stringify({ confirm: true }),
      });
      const result = await api<BotReadiness>(`/channels/${c.id}/bot-readiness`);
      setBotDiagnostics((prev) => ({ ...prev, [c.id]: result }));
      setTokenNotice(
        t(
          'تمت إعادة محادثة التجربة للبوت. ابعت رسالة واتساب عادية جديدة وجرب الرد.',
          'Preview conversation returned to the bot. Send an ordinary WhatsApp message to test.',
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function inspectWhatsAppAuth(c: Channel) {
    setBusy(true);
    setError('');
    try {
      const result = await api<WhatsAppAuthDiagnostics>(
        `/channels/${c.id}/whatsapp-auth-diagnostics`,
      );
      setAuthDiagnostics((prev) => ({ ...prev, [c.id]: result }));
      if (result.connectionHealth)
        setItems((rows) =>
          rows.map((row) =>
            row.id === c.id ? { ...row, connectionHealth: result.connectionHealth } : row,
          ),
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function rotateWhatsAppToken(event: React.FormEvent<HTMLFormElement>, c: Channel) {
    event.preventDefault();
    if (busy || replacementToken.trim().length < 10) return;
    setBusy(true);
    setError('');
    setTokenNotice('');
    try {
      await api(`/channels/${c.id}/credentials`, {
        method: 'POST',
        body: JSON.stringify({ accessToken: replacementToken.trim() }),
      });
      setReplacementToken('');
      setEditingTokenId(null);
      setAuthDiagnostics((prev) => {
        const next = { ...prev };
        delete next[c.id];
        return next;
      });
      setTokenNotice(
        t(
          'تم التحقق من صلاحية التوكين ووصوله لنفس رقم واتساب وحفظه. افحص اتصال المزود للتأكد من اشتراك Webhook. لا تُعتبر هذه الخطوة اختبار إرسال حي.',
          'The token was validated for messaging and this exact phone, then saved. Verify the webhook subscription next. This is not a live delivery test.',
        ),
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const load = () =>
    api<Channel[]>('/channels')
      .then((rows) => {
        setItems(rows);
        // Deep-link from a provider account directly to its existing settings.
        const requested = new URLSearchParams(window.location.search).get('manage');
        if (requested && rows.some((row) => row.id === requested)) {
          setPlatform('all');
          setFilter('all');
          setSearch('');
          setExpandedId(requested);
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              document.getElementById('channel-' + requested)?.scrollIntoView({
                block: 'center',
              }),
            ),
          );
        }
        setError('');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    if (!getSession()) {
      window.location.href = '/login';
      return;
    }
    load();
    void api<{role:string}>('/workspace').then(r=>setRole(r.role)).catch(()=>setRole(''));
    const onPop=()=>{setExpandedId(new URLSearchParams(window.location.search).get('manage'));setDetailTab('overview');setError('');setSavedNotice('');};
    window.addEventListener('popstate',onPop);
    void api<{ id: string; name: string; provider: string; enabled: boolean; status: string }[]>(
      '/integrations',
    )
      .then((rows) =>
        setGoogle(
          rows
            .filter((row) => row.provider === 'google')
            .map((row) => ({
              id: row.id,
              name: row.name,
              type: 'google',
              external_id: '',
              status: row.enabled ? 'active' : 'disabled',
              connectionHealth: {
                state: row.status === 'connected' ? 'connected' : 'needs_action',
                checkedAt: null,
                reason: '',
              },
            })),
        ),
      )
      .catch(() => setGoogle([]));
    return ()=>window.removeEventListener('popstate',onPop);
  }, []);

  async function remove(id: string) {
    setBusy(true);
    setError('');
    try {
      await api(`/channels/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'disabled' }),
      });
      setDeleting(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.polishedPage}>
      <header className={styles.hero}>
        <div><h1><NavIcon name="channels"/>{t('قنوات الاتصال','Channels')}</h1><p>{t('إدارة قنوات التواصل ومتابعة حالة الاتصال','Manage your communication channels and connection health')}</p></div>
        {!selected?<button type="button" className={styles.primaryAction} onClick={()=>setAvailableOpen(true)}><NavIcon name="plus"/>{t('ربط قناة جديدة','Connect a channel')}</button>:<button type="button" className="btn" disabled={busy||identityBusy} onClick={()=>openChannel(null)}><NavIcon name="chevron"/>{t('العودة إلى القنوات','Back to channels')}</button>}
      </header>
      {error&&<div role="alert" className={styles.errorBox}><NavIcon name="circleClose"/><span>{error}</span><button type="button" className="btn" onClick={()=>setError('')}>{t('إغلاق','Dismiss')}</button></div>}
      {(tokenNotice||savedNotice)&&<div role="status" className={styles.successBox}><NavIcon name="circleCheck"/>{savedNotice||tokenNotice}</div>}
      {loading&&<p className={styles.emptyPanel} role="status">{t('جارٍ تحميل القنوات…','Loading channels…')}</p>}
      {!selected&&!loading&&<>
        <div className={styles.statGrid} aria-label={t('ملخص حالة القنوات','Channel health summary')}>
          {([['connected','circleCheck',counts.connected,t('قنوات متصلة','Connected')],['attention','flag',counts.needsAction,t('تحتاج إجراء','Need attention')],['disconnected','circleClose',counts.disconnected,t('قنوات متوقفة','Disconnected')],['all','grid',counts.total,t('إجمالي القنوات','Total channels')]] as const).map(([key,icon,count,label])=><button key={key} type="button" className={styles.statTile} data-tone={key} aria-pressed={filter===key} onClick={()=>{setFilter(filter===key?'all':key);setPlatform('all');setSearch('');setDepartment('all');}}><span className={styles.statSymbol}><NavIcon name={icon}/></span><span><small>{label}</small><strong>{count}</strong></span></button>)}
        </div>
        <section className={styles.directory}>
          <div className={styles.filterBar}>
            <label className={styles.searchBox}><NavIcon name="search"/><input type="search" aria-label={t('بحث بالاسم أو رقم الهاتف','Search name or phone')} placeholder={t('بحث بالاسم أو الرقم…','Search name or number…')} value={search} onChange={e=>setSearch(e.target.value)}/></label>
            <select aria-label={t('المنصة','Platform')} value={platform} onChange={e=>setPlatform(e.target.value)}><option value="all">{t('كل المنصات','All platforms')}</option>{Object.entries(CHANNEL_NAMES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
            <select aria-label={t('الحالة','Status')} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">{t('كل الحالات','All statuses')}</option>{Object.entries(stateLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
            <select aria-label={t('القسم','Department')} value={department} onChange={e=>setDepartment(e.target.value)}><option value="all">{t('كل الأقسام','All departments')}</option><option value="none">{t('دون قسم','No department')}</option>{departments.map(d=><option key={d} value={d}>{d}</option>)}</select>
            <div className={styles.viewSwitch}>{(['cards','list'] as const).map(v=><button type="button" key={v} aria-pressed={view===v} title={v==='cards'?t('عرض الكروت','Card view'):t('عرض القائمة','List view')} aria-label={v==='cards'?t('عرض الكروت','Card view'):t('عرض القائمة','List view')} onClick={()=>setView(v)}><NavIcon name={v==='cards'?'grid':'list'}/></button>)}</div>
          </div>
          <div className={styles.cardGrid} data-view={view}>
          {visible.map(c=><article key={c.id} id={'channel-'+c.id} className={styles.channelTile} data-state={stateOf(c)}>
            <header className={styles.tileHeader}><div className={styles.channelIdentity}><span className={styles.platformIcon} data-platform={c.type}><ChannelLogo id={c.type}/></span><div><h2><bdi>{c.name}</bdi></h2><small>{platformName(c)}</small></div></div><span className={styles.statusChip} data-state={stateOf(c)}><span/>{healthText(c)}</span></header>
            <div className={styles.numberBox}><div><small><NavIcon name={c.type==='whatsapp'?'phone':'globe'}/>{c.type==='whatsapp'?t('رقم واتساب المرتبط','WhatsApp number'):t('القناة المرتبطة','Connected channel')}</small><strong>{c.type==='whatsapp'?(phoneOf(c)?<bdi>{phoneOf(c)}</bdi>:t('الرقم غير متاح بعد','Number not available yet')):platformName(c)}</strong></div>{c.type==='whatsapp'&&(phoneOf(c)?<button type="button" className={styles.textAction} onClick={()=>void copyPhone(c)}><NavIcon name="copy"/>{copied===c.id+'-phone'?t('تم النسخ','Copied'):t('نسخ','Copy')}</button>:canManage&&<button type="button" className={styles.textAction} disabled={identityBusy||c.status!=='active'} onClick={()=>void refreshPhone(c)}><NavIcon name="refresh"/>{t('جلب الرقم','Get number')}</button>)}</div>
            <div className={styles.departmentLine}><span><NavIcon name="team"/>{t('القسم المسؤول','Department')}</span><strong>{deptOf(c)||t('غير محدد','Not set')}</strong></div>
            <div className={styles.healthLine}><NavIcon name={stateOf(c)==='connected'?'circleCheck':'flag'}/><div><strong>{c.connectionHealth?.reason==='provider_verified'?t('تم التحقق من الحساب لدى المزود','Provider account verified'):healthText(c)}</strong><small>{t('آخر فحص','Last check')}: {formatDate(c.connectionHealth?.checkedAt)}</small></div></div>
            {c.type!=='google'?<div className={styles.tileActions}><Link className={styles.primaryAction} href={channelHref('/dashboard/flows',c.id)}><NavIcon name="agents"/>{t('إعداد البوت والنشر','Set up bot')}</Link><Link className={styles.secondaryAction} href={channelHref('/dashboard/inbox',c.id)}><NavIcon name="chat"/>{t('محادثات القناة','Channel inbox')}</Link></div>:<Link className={styles.secondaryAction} href="/dashboard/channels/connect/google"><NavIcon name="settings"/>{t('إدارة ربط Google','Manage Google connection')}</Link>}
            <footer className={styles.tileFooter}>{c.type!=='google'?<button type="button" className={styles.textAction} onClick={()=>openChannel(c)}><NavIcon name="settings"/>{t('إدارة القناة','Manage channel')}</button>:<span/>}
              {c.widgetSnippet?<button type="button" className={styles.textAction} onClick={()=>install(c)}><NavIcon name="globe"/>{t('تثبيت على الموقع','Install on website')}</button>:c.type!=='google'&&canManage&&<button type="button" className={styles.textAction} disabled={busy||identityBusy||c.status!=='active'} onClick={()=>{openChannel(c,'health');void verify(c);}}><NavIcon name="shield"/>{t('فحص الاتصال','Check connection')}</button>}
              <details className={styles.moreMenu}><summary aria-label={t('المزيد','More')}><NavIcon name="moreVertical"/></summary><div><Link className="btn" href={'/dashboard/channels/connect/'+c.type}><NavIcon name="settings"/>{t('إعدادات الربط','Connection setup')}</Link>{c.type!=='google'&&<button className="btn" type="button" onClick={()=>openChannel(c,'identity')}><NavIcon name="edit"/>{t('بيانات القناة','Channel identity')}</button>}{c.type==='whatsapp'&&<Link className="btn" href={'/dashboard/channels/'+c.id+'/templates'}><NavIcon name="list"/>{t('القوالب','Templates')}</Link>}{c.type!=='google'&&canManage&&c.status==='active'&&<button type="button" className="btn btn-danger" onClick={()=>setDeleting(c)}><NavIcon name="circleClose"/>{t('فصل الاتصال','Disconnect')}</button>}</div></details>
            </footer>
          </article>)}
          {!visible.length&&<div className={styles.emptyPanel}><NavIcon name="channels"/><strong>{accounts.length?t('لا توجد قنوات مطابقة','No matching channels'):t('لم تربط أي قناة بعد','No channels connected yet')}</strong><button className="btn" type="button" onClick={()=>{if(!accounts.length)setAvailableOpen(true);else{setSearch('');setPlatform('all');setFilter('all');setDepartment('all');}}}>{accounts.length?t('مسح الفلاتر','Clear filters'):t('ربط قناة','Connect a channel')}</button></div>}
          </div><p className={styles.resultCount}>{t('عرض','Showing')} {visible.length} {t('من إجمالي','of')} {accounts.length} {t('قناة','channels')}</p>
        </section>
      </>}
      {selected&&selected.type!=='google'&&(()=>{const c=selected;return <section key={c.id} className={styles.managePage}>
        <header className={styles.manageHeader}><div className={styles.channelIdentity}><span className={styles.platformIcon} data-platform={c.type}><ChannelLogo id={c.type}/></span><div><h2><bdi>{c.name}</bdi></h2><small>{platformName(c)} {phoneOf(c)&&<>· <bdi>{phoneOf(c)}</bdi></>}</small></div></div><span className={styles.statusChip} data-state={stateOf(c)}><span/>{healthText(c)}</span><div className={styles.manageActions}><Link className={styles.primaryAction} href={channelHref('/dashboard/flows',c.id)}><NavIcon name="agents"/>{t('إعداد البوت','Set up bot')}</Link><Link className={styles.secondaryAction} href={channelHref('/dashboard/inbox',c.id)}><NavIcon name="chat"/>{t('المحادثات','Inbox')}</Link></div></header>
        <nav className={styles.manageTabs} aria-label={t('أقسام إدارة القناة','Channel management sections')}>{([['overview','grid',t('نظرة عامة','Overview')],['identity','user',t('بيانات القناة','Channel identity')],['health','shield',t('فحص الاتصال','Connection health')],...(c.type==='whatsapp'?[['templates','list',t('القوالب','Templates')]]:[]),['advanced','settings',t('الإعدادات','Settings')]] as [typeof detailTab,string,string][]).map(([key,icon,label])=><button type="button" key={key} disabled={busy||identityBusy} aria-pressed={detailTab===key} onClick={()=>{setDetailTab(key);setError('');setSavedNotice('');}}><NavIcon name={icon}/>{label}</button>)}</nav>
        <div className={styles.manageBody}>
          {detailTab==='overview'&&<><div className={styles.overviewGrid}>{[[t('حالة الاتصال','Connection status'),healthText(c),'shield'],[t('تشغيل القناة','Local status'),statusLabel(c.status,t),'circleCheck'],[t('القسم المسؤول','Department'),deptOf(c)||t('غير محدد','Not set'),'team'],[t('نشر البوت','Bot publication'),botDiagnostics[c.id]?String(botDiagnostics[c.id].publishedFlowCount)+' '+t('تدفقات منشورة','published flows'):t('يتطلب التحقق','Needs verification'),'agents']].map(([label,value,icon])=><div key={label}><NavIcon name={icon}/><small>{label}</small><strong>{value}</strong></div>)}</div><div className={styles.infoPanel}><NavIcon name="stopwatch"/><div><strong>{t('آخر فحص للاتصال','Last connection check')}</strong><p>{formatDate(c.connectionHealth?.checkedAt)}</p></div></div>                          {c.connectionHealth?.reason && (
                            <p className={styles.healthMessage}>
                              {
                                (
                                  {
                                    authorization_expiring: t(
                                      'تفويض Meta ينتهي خلال 7 أيام. جدّد التفويض قبل توقف الإرسال.',
                                      'Meta authorization expires within 7 days. Renew it before delivery stops.',
                                    ),
                                    messaging_permission_required: t(
                                      'تعذّر إثبات صلاحية إرسال واتساب. افحص صلاحيات Meta.',
                                      'WhatsApp messaging permission is not verified. Check Meta authorization.',
                                    ),
                                    authorization_unavailable: t(
                                      'تعذر التحقق من تفويض Meta الآن. أعد الفحص قبل اعتماد الاتصال.',
                                      'Meta authorization could not be verified. Check again before relying on the connection.',
                                    ),
                                    provider_verified: t(
                                      'تم التحقق من الحساب لدى المزود.',
                                      'Provider account verified.',
                                    ),
                                    authorization_expired: t(
                                      'أعد التفويض من مسار الربط الرسمي.',
                                      'Authorize again through the official connection.',
                                    ),
                                    provider_unreachable: t(
                                      'تعذر الوصول للمزود. أعد المحاولة لاحقًا.',
                                      'Provider unreachable. Try later.',
                                    ),
                                    provider_rejected: t(
                                      'راجع صلاحيات الحساب ثم أعد التفويض.',
                                      'Review account permissions and authorize again.',
                                    ),
                                    waba_not_subscribed: t(
                                      'تطبيق Meta غير مشترك في حساب واتساب هذا. راجع Subscribe webhooks في Production setup على WABA الصحيح.',
                                      'The Meta app is not subscribed to this WABA. Check Subscribe webhooks on the correct WABA in Production setup.',
                                    ),
                                    waba_webhook_override: t(
                                      'حساب واتساب يرسل إشعاراته إلى عنوان Webhook مختلف. راجع إعداد Override لدى Meta.',
                                      'This WABA uses another webhook URL override. Review the Meta override settings.',
                                    ),
                                    waba_subscription_unverified: t(
                                      'تعذّر تأكيد اشتراك WABA؛ راجع WABA ID وإعداد META_APP_ID.',
                                      'WABA subscription could not be confirmed; check WABA ID and META_APP_ID.',
                                    ),
                                    waba_subscription_check_failed: t(
                                      'تعذّر قراءة اشتراكات WABA. تأكد أن التوكين له صلاحية whatsapp_business_management.',
                                      'Unable to read WABA subscriptions. Ensure the token has whatsapp_business_management permission.',
                                    ),
                                    external_access_disabled: t(
                                      'الفحص الخارجي غير مفعّل لدى مسؤول المنصة.',
                                      'External verification is disabled by the operator.',
                                    ),
                                    verification_required: t(
                                      'يلزم فحص حديث للمزود.',
                                      'A recent provider check is required.',
                                    ),
                                    widget_installation_required: t(
                                      'ثبّت الويدجت ثم جرّب المحادثة.',
                                      'Install the widget and try a conversation.',
                                    ),
                                    disabled_locally: t(
                                      'القناة متوقفة محليًا.',
                                      'Channel disabled locally.',
                                    ),
                                  } as Record<string, string>
                                )[c.connectionHealth.reason]
                              }
                            </p>
                          )}
{c.widgetSnippet&&<button className={styles.primaryAction} type="button" onClick={()=>install(c)}><NavIcon name="globe"/>{t('تثبيت على الموقع','Install on website')}</button>}</>}
          {detailTab==='identity'&&<form className={styles.identityForm} onSubmit={e=>void saveIdentity(e,c)}><h3><NavIcon name="user"/>{t('البيانات التعريفية للقناة','Channel identity')}</h3><label className="field">{t('اسم القناة المخصص','Custom channel name')}<input name="name" defaultValue={c.name} maxLength={80} required disabled={!canManage||identityBusy}/></label>
            {c.type==='whatsapp'&&<div className={styles.numberBox}><div><small><NavIcon name="phone"/>{t('رقم واتساب الحقيقي من Meta','Actual WhatsApp number from Meta')}</small><strong>{phoneOf(c)?<bdi>{phoneOf(c)}</bdi>:t('غير متاح بعد','Not available yet')}</strong><small>{formatDate(typeof c.settings?.providerPhoneCheckedAt==='string'?c.settings.providerPhoneCheckedAt:null)}</small></div>{canManage&&<button type="button" className="btn" disabled={identityBusy||c.status!=='active'} onClick={()=>void refreshPhone(c)}><NavIcon name="refresh"/>{t('تحديث الرقم','Refresh number')}</button>}{phoneOf(c)&&<button type="button" className="btn" onClick={()=>void copyPhone(c)}><NavIcon name="copy"/>{copied===c.id+'-phone'?t('تم النسخ','Copied'):t('نسخ','Copy')}</button>}</div>}
            <label className="field">{t('القسم أو وظيفة القناة','Department or channel purpose')}<input name="department" defaultValue={deptOf(c)} maxLength={80} disabled={!canManage||identityBusy} placeholder={t('مثال: المبيعات، الحجوزات','e.g. Sales, Bookings')}/><small>{t('للتعريف والتصفية فقط؛ لا يغير قواعد توزيع المحادثات.','Display and filtering only; does not change conversation routing.')}</small></label><label className="field">{t('ملاحظات داخلية','Internal notes')}<textarea name="note" rows={3} maxLength={1000} defaultValue={String(c.settings?.internalNote||'')} disabled={!canManage||identityBusy}/></label>{canManage&&<button className={styles.primaryAction} disabled={identityBusy}><NavIcon name="check"/>{identityBusy?t('جارٍ الحفظ…','Saving…'):t('حفظ التعديلات','Save changes')}</button>}</form>}
          {detailTab==='health'&&<div className={styles.healthPanel}><h3><NavIcon name="shield"/>{t('سلامة الاتصال','Connection health')}</h3>{[[t('حالة المزود','Provider status'),healthText(c),stateOf(c)==='connected'],...(c.type==='whatsapp'?[[t('رقم الهاتف','Phone number'),phoneOf(c)||t('غير متاح بعد','Not available yet'),!!phoneOf(c)]]:[]),[t('استلام وإرسال الرسائل','Message delivery'),t('يلزم اختبار حي','Live test required'),false]].map(([label,value,ok])=><div className={styles.healthCheck} key={String(label)} data-ok={ok}><NavIcon name={ok?'circleCheck':'flag'}/><strong>{label}</strong><span>{value}</span></div>)}                          {c.connectionHealth?.reason && (
                            <p className={styles.healthMessage}>
                              {
                                (
                                  {
                                    authorization_expiring: t(
                                      'تفويض Meta ينتهي خلال 7 أيام. جدّد التفويض قبل توقف الإرسال.',
                                      'Meta authorization expires within 7 days. Renew it before delivery stops.',
                                    ),
                                    messaging_permission_required: t(
                                      'تعذّر إثبات صلاحية إرسال واتساب. افحص صلاحيات Meta.',
                                      'WhatsApp messaging permission is not verified. Check Meta authorization.',
                                    ),
                                    authorization_unavailable: t(
                                      'تعذر التحقق من تفويض Meta الآن. أعد الفحص قبل اعتماد الاتصال.',
                                      'Meta authorization could not be verified. Check again before relying on the connection.',
                                    ),
                                    provider_verified: t(
                                      'تم التحقق من الحساب لدى المزود.',
                                      'Provider account verified.',
                                    ),
                                    authorization_expired: t(
                                      'أعد التفويض من مسار الربط الرسمي.',
                                      'Authorize again through the official connection.',
                                    ),
                                    provider_unreachable: t(
                                      'تعذر الوصول للمزود. أعد المحاولة لاحقًا.',
                                      'Provider unreachable. Try later.',
                                    ),
                                    provider_rejected: t(
                                      'راجع صلاحيات الحساب ثم أعد التفويض.',
                                      'Review account permissions and authorize again.',
                                    ),
                                    waba_not_subscribed: t(
                                      'تطبيق Meta غير مشترك في حساب واتساب هذا. راجع Subscribe webhooks في Production setup على WABA الصحيح.',
                                      'The Meta app is not subscribed to this WABA. Check Subscribe webhooks on the correct WABA in Production setup.',
                                    ),
                                    waba_webhook_override: t(
                                      'حساب واتساب يرسل إشعاراته إلى عنوان Webhook مختلف. راجع إعداد Override لدى Meta.',
                                      'This WABA uses another webhook URL override. Review the Meta override settings.',
                                    ),
                                    waba_subscription_unverified: t(
                                      'تعذّر تأكيد اشتراك WABA؛ راجع WABA ID وإعداد META_APP_ID.',
                                      'WABA subscription could not be confirmed; check WABA ID and META_APP_ID.',
                                    ),
                                    waba_subscription_check_failed: t(
                                      'تعذّر قراءة اشتراكات WABA. تأكد أن التوكين له صلاحية whatsapp_business_management.',
                                      'Unable to read WABA subscriptions. Ensure the token has whatsapp_business_management permission.',
                                    ),
                                    external_access_disabled: t(
                                      'الفحص الخارجي غير مفعّل لدى مسؤول المنصة.',
                                      'External verification is disabled by the operator.',
                                    ),
                                    verification_required: t(
                                      'يلزم فحص حديث للمزود.',
                                      'A recent provider check is required.',
                                    ),
                                    widget_installation_required: t(
                                      'ثبّت الويدجت ثم جرّب المحادثة.',
                                      'Install the widget and try a conversation.',
                                    ),
                                    disabled_locally: t(
                                      'القناة متوقفة محليًا.',
                                      'Channel disabled locally.',
                                    ),
                                  } as Record<string, string>
                                )[c.connectionHealth.reason]
                              }
                            </p>
                          )}
<div className={styles.infoPanel}><NavIcon name="question"/><p>{t('الاتصال بالمزود لا يثبت نشر البوت أو وصول الرسائل. افحص التشخيص أو اختبر على قناة مخصصة.','Provider connectivity does not prove bot publication or message delivery. Diagnose or test on a dedicated channel.')}</p></div>{canManage&&c.type!=='web'&&<button type="button" className={styles.primaryAction} disabled={busy||identityBusy||c.status!=='active'} onClick={()=>void verify(c)}><NavIcon name="refresh"/>{t('إعادة فحص الاتصال','Verify provider connection')}</button>}{canManage&&<div className={styles.diagnosticPanel}>                          {c.type === 'whatsapp' && (
                            <details className="channel-advanced">
                              <DisclosureSummary>
                                {t(
                                  'إعدادات متقدمة وتشخيص Meta',
                                  'Advanced settings and Meta diagnostics',
                                )}
                              </DisclosureSummary>
                              <button
                                type="button"
                                className="btn"
                                disabled={busy}
                                onClick={() => inspectBot(c)}
                              >
                                <NavIcon name="agents"/>{t('تشخيص ردود البوت', 'Diagnose bot replies')}
                              </button>
                              <button
                                type="button"
                                className="btn"
                                disabled={busy}
                                onClick={() => inspectWhatsAppAuth(c)}
                              >
                                <NavIcon name="shield"/>{t(
                                  'فحص صلاحيات الإرسال وأخطاء Meta',
                                  'Check Meta messaging permissions and errors',
                                )}
                              </button>
                              {authDiagnostics[c.id] && (
                                <section className="card stack" role="status">
                                  <strong>
                                    {t(
                                      'تشخيص صلاحية إرسال واتساب',
                                      'WhatsApp outbound authorization',
                                    )}
                                  </strong>
                                  <p>
                                    {t('صلاحية التوكين للإرسال', 'Messaging token permission')}:{' '}
                                    {
                                      (
                                        {
                                          granted: t('موجودة', 'Granted'),
                                          missing_permission: t(
                                            'ناقصة: whatsapp_business_messaging',
                                            'Missing whatsapp_business_messaging',
                                          ),
                                          invalid_token: t(
                                            'التوكين غير صالح أو منتهي',
                                            'Token invalid or expired',
                                          ),
                                          wrong_app: t(
                                            'التوكين تابع لتطبيق Meta مختلف',
                                            'Token belongs to a different Meta app',
                                          ),
                                          unknown: t(
                                            'تعذّر التحقق من الصلاحيات',
                                            'Permission check unavailable',
                                          ),
                                        } as Record<string, string>
                                      )[authDiagnostics[c.id].token.status]
                                    }
                                  </p>
                                  {authDiagnostics[c.id].token.expiresAt && (
                                    <p>
                                      {t('انتهاء التوكين', 'Token expiry')}:{' '}
                                      {new Date(
                                        authDiagnostics[c.id].token.expiresAt!,
                                      ).toLocaleString()}
                                    </p>
                                  )}
                                  {authDiagnostics[c.id].token.managementGranted === false && (
                                    <p className="notice">
                                      {t(
                                        'صلاحية إدارة حساب واتساب غير موجودة؛ قد يتعذر فحص اشتراك Webhook.',
                                        'WhatsApp management permission is missing; webhook subscription checks may fail.',
                                      )}
                                    </p>
                                  )}
                                  {authDiagnostics[c.id].token.tokenType === 'USER' && (
                                    <p className="notice">
                                      {t(
                                        'هذا توكين مستخدم. استخدم تفويض Embedded Signup أو System User المناسب للتشغيل المستمر.',
                                        'This is a user token. Use Embedded Signup authorization or the appropriate System User for ongoing operation.',
                                      )}
                                    </p>
                                  )}
                                  {authDiagnostics[c.id].token.status === 'granted' &&
                                    !authDiagnostics[c.id].token.expiresAt && (
                                      <p>
                                        {t(
                                          'لم تُبلغ Meta عن موعد انتهاء للتوكين؛ يظل قابلاً للإلغاء.',
                                          'Meta reported no scheduled token expiry; access can still be revoked.',
                                        )}
                                      </p>
                                    )}
                                  <p>
                                    {t(
                                      'أخطاء الإرسال المسجلة آخر 6 ساعات',
                                      'Outbound failures in last 6h',
                                    )}
                                    : {authDiagnostics[c.id].recentFailures.length}
                                  </p>
                                  {authDiagnostics[c.id].recentFailures
                                    .slice(0, 5)
                                    .map((failure, i) => (
                                      <p key={i}>
                                        {new Date(failure.createdAt).toLocaleTimeString()} —{' '}
                                        {
                                          (
                                            {
                                              authentication: t(
                                                'خطأ مصادقة من المزود',
                                                'Provider authentication error',
                                              ),
                                              permission: t(
                                                'نقص صلاحيات',
                                                'Insufficient permission',
                                              ),
                                              provider_limit: t(
                                                'حد إرسال من المزود',
                                                'Provider rate limit',
                                              ),
                                              delivery_blocked: t(
                                                'منع إرسال محلي',
                                                'Local delivery blocked',
                                              ),
                                              other: t('خطأ إرسال آخر', 'Other outbound error'),
                                            } as Record<string, string>
                                          )[failure.category]
                                        }
                                        {failure.code ? ` (#${failure.code})` : ''}
                                      </p>
                                    ))}
                                  {authDiagnostics[c.id].recentFailures.some((failure) =>
                                    ['authentication', 'permission'].includes(failure.category),
                                  ) ||
                                  ['invalid_token', 'missing_permission', 'wrong_app'].includes(
                                    authDiagnostics[c.id].token.status,
                                  ) ? (
                                    <p className="notice">
                                      {t(
                                        'الربط واستقبال الرسائل لا يضمنان صلاحية الإرسال. أنشئ توكين من تطبيق Bot two بصلاحية whatsapp_business_messaging وwhatsapp_business_management، ثم حدّث التوكين فقط هنا.',
                                        'Receiving messages does not prove outgoing permission. Generate a token for the Bot two Meta app with whatsapp_business_messaging and whatsapp_business_management, then update only the token here.',
                                      )}
                                    </p>
                                  ) : null}
                                </section>
                              )}
                              {authDiagnostics[c.id] && (
                                <button
                                  type="button"
                                  className="btn"
                                  disabled={busy}
                                  onClick={() => {
                                    setEditingTokenId(editingTokenId === c.id ? null : c.id);
                                    setReplacementToken('');
                                    setTokenNotice('');
                                  }}
                                >
                                  {t(
                                    'تحديث توكين Meta لنفس الرقم',
                                    'Update Meta token for this number',
                                  )}
                                </button>
                              )}
                              {editingTokenId === c.id && (
                                <form
                                  className="card stack"
                                  onSubmit={(event) => rotateWhatsAppToken(event, c)}
                                >
                                  <label className="field">
                                    {t(
                                      'توكين جديد من Meta (لا يظهر ولا يُعاد عرضه)',
                                      'New Meta token (never displayed again)',
                                    )}
                                    <input
                                      type="password"
                                      autoComplete="off"
                                      required
                                      minLength={10}
                                      value={replacementToken}
                                      onChange={(event) => setReplacementToken(event.target.value)}
                                    />
                                  </label>
                                  <p>
                                    {t(
                                      'يُحدَّث رمز الوصول فقط؛ لا يتغيّر الرقم أو Phone Number ID أو Coexistence. الرسائل الفاشلة لن يعاد إرسالها تلقائيًا.',
                                      'Only the access token changes; the phone number and Coexistence stay intact. Previously failed messages are not automatically retried.',
                                    )}
                                  </p>
                                  <button
                                    type="submit"
                                    className="btn"
                                    disabled={busy || replacementToken.trim().length < 10}
                                  >
                                    {t(
                                      'حفظ التوكين على القناة الحالية',
                                      'Save token to existing channel',
                                    )}
                                  </button>
                                </form>
                              )}
                              {botDiagnostics[c.id] && (
                                <section className="card stack" role="status">
                                  <strong>
                                    {t('تشخيص إرسال الرد الآلي', 'Bot reply diagnostics')}
                                  </strong>
                                  <p>
                                    {t(
                                      'عدد البوتات المنشورة لهذه القناة',
                                      'Published flows on this channel',
                                    )}
                                    : {botDiagnostics[c.id].publishedFlowCount}
                                  </p>
                                  <p>
                                    {t('المحادثات المسندة للبوت', 'Bot-owned conversations')}:{' '}
                                    {botDiagnostics[c.id].activeConversationsBot} ·{' '}
                                    {t('للموظفين', 'Human-owned')}:{' '}
                                    {botDiagnostics[c.id].activeConversationsHuman}
                                  </p>
                                  <p>
                                    {t(
                                      'ردود البوت المنشأة آخر 6 ساعات',
                                      'Bot replies created in last 6h',
                                    )}
                                    : {botDiagnostics[c.id].recentBotReplies} ·{' '}
                                    {t('ردود أُرسلت', 'Sent replies')}:{' '}
                                    {botDiagnostics[c.id].recentSent} ·{' '}
                                    {t('إرسال محظور', 'Blocked deliveries')}:{' '}
                                    {botDiagnostics[c.id].recentBlocked} ·{' '}
                                    {t('إرسال فاشل', 'Failed deliveries')}:{' '}
                                    {botDiagnostics[c.id].recentFailed}
                                  </p>
                                  <p>
                                    {t('وضع إرسال البوت التجريبي', 'Scoped preview bot delivery')}:{' '}
                                    {botDiagnostics[c.id].previewBotEnabled
                                      ? t('مفعّل', 'Enabled')
                                      : t('غير مفعّل', 'Disabled')}
                                  </p>
                                  {botDiagnostics[c.id].previewConversation && (
                                    <section className="stack">
                                      <strong>
                                        {t(
                                          'حالة محادثة واتساب التجريبية الحالية',
                                          'Current preview conversation status',
                                        )}
                                      </strong>
                                      <p>
                                        {t('المسؤول', 'Owner')}:{' '}
                                        {botDiagnostics[c.id].previewConversation!.handledBy ===
                                        'bot'
                                          ? t('البوت', 'Bot')
                                          : t('الموظف', 'Human')}
                                      </p>
                                      <p>
                                        {t('حالة المحادثة', 'Conversation')}:{' '}
                                        {botDiagnostics[c.id].previewConversation!.status}
                                      </p>
                                      <p>
                                        {t('جلسة البوت', 'Flow session')}:{' '}
                                        {botDiagnostics[c.id].previewConversation!.sessionStatus ||
                                          t('لا توجد', 'None')}{' '}
                                        {botDiagnostics[c.id].previewConversation!.sessionWaitKind
                                          ? `(${botDiagnostics[c.id].previewConversation!.sessionWaitKind})`
                                          : ''}
                                      </p>
                                      <p>
                                        {t(
                                          'أحداث الاستقبال المعلقة أو الفاشلة',
                                          'Pending/failed inbound events',
                                        )}
                                        :{' '}
                                        {
                                          botDiagnostics[c.id].previewConversation!
                                            .pendingInboundEvents
                                        }
                                      </p>
                                      <p>
                                        {t(
                                          'البوت المختار لمحادثة التجربة',
                                          'Selected preview flow',
                                        )}
                                        :{' '}
                                        {botDiagnostics[c.id].previewConversation!
                                          .restartFlowName ??
                                          t('لا يوجد بوت محدد', 'No uniquely selected flow')}
                                      </p>
                                      {botDiagnostics[c.id].previewConversation!.lastBotReply && (
                                        <p>
                                          {t('آخر رد للبوت', 'Last bot reply')} —{' '}
                                          {new Date(
                                            botDiagnostics[c.id].previewConversation!.lastBotReply!
                                              .createdAt,
                                          ).toLocaleString()}
                                          :{' '}
                                          {
                                            botDiagnostics[c.id].previewConversation!.lastBotReply!
                                              .status
                                          }
                                          {' / '}
                                          {botDiagnostics[c.id].previewConversation!.lastBotReply!
                                            .jobStatus ?? '—'}
                                          {botDiagnostics[c.id].previewConversation!.lastBotReply!
                                            .category !== 'other' && (
                                            <>
                                              {' '}
                                              —{' '}
                                              {
                                                botDiagnostics[c.id].previewConversation!
                                                  .lastBotReply!.category
                                              }
                                              {botDiagnostics[c.id].previewConversation!
                                                .lastBotReply!.code
                                                ? ` (#${botDiagnostics[c.id].previewConversation!.lastBotReply!.code})`
                                                : ''}
                                            </>
                                          )}
                                        </p>
                                      )}
                                      {!botDiagnostics[c.id].previewConversation!
                                        .restartEligible && (
                                        <p className="notice">
                                          {t(
                                            'لم يمكن تحديد بوت واحد لإعادة تشغيل هذه المحادثة. راجع البوتات المنشورة أو جرّب بوتًا محددًا أولًا.',
                                            'No single bot could be selected for this test conversation. Check published bots or run a specific bot first.',
                                          )}
                                        </p>
                                      )}
                                      {botDiagnostics[c.id].previewBotEnabled &&
                                        botDiagnostics[c.id].previewConversation!
                                          .restartEligible && (
                                          <button
                                            className="btn"
                                            type="button"
                                            disabled={busy}
                                            onClick={() => restartPreviewBot(c)}
                                          >
                                            {t(
                                              'إعادة تشغيل البوت لمحادثة التجربة فقط',
                                              'Restart bot for this preview conversation only',
                                            )}
                                          </button>
                                        )}
                                    </section>
                                  )}
                                  {botDiagnostics[c.id].flowTriggers.map((f, idx) => (
                                    <div key={idx}>
                                      <p>
                                        <strong>{f.name}</strong>: {f.types.join(', ')}
                                      </p>
                                      <p>
                                        {t('خطوات النسخة المنشورة', 'Published steps')}:{' '}
                                        {f.publishedSteps} · {t('خطوات المسودة', 'Draft steps')}:{' '}
                                        {f.draftSteps} ·{' '}
                                        {t(
                                          'خطوات الرسائل والأسئلة المنشورة',
                                          'Published message and question steps',
                                        )}
                                        : {f.publishedReplies}
                                      </p>
                                      {f.draftSteps > f.publishedSteps && (
                                        <p className="notice">
                                          {t(
                                            'المسودة فيها خطوات أكثر من المنشور. احفظ وانشر أحدث نسخة من محرر البوت.',
                                            'The draft has more steps than the published version. Save and publish the latest version in the bot editor.',
                                          )}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                  {botDiagnostics[c.id].activeConversationsHuman > 0 && (
                                    <p className="notice">
                                      {t(
                                        'المحادثات المستلمة بواسطة موظف لا يرد عليها البوت. أعد محادثة التجربة للبوت من Inbox عند انتهاء الموظف.',
                                        'The bot does not reply in human-owned conversations. Return the test conversation to the bot from Inbox when the agent is finished.',
                                      )}
                                    </p>
                                  )}
                                  {botDiagnostics[c.id].previewBotEnabled &&
                                    botDiagnostics[c.id].flowTriggers.filter((f) =>
                                      f.types.includes('first_message'),
                                    ).length > 1 &&
                                    !botDiagnostics[c.id].previewConversation?.restartEligible && (
                                      <p className="notice">
                                        {t(
                                          'يوجد أكثر من بوت ترحيب لهذه القناة ولم يمكن تحديد البوت المستخدم سابقًا.',
                                          'Multiple welcome flows are published and no previously used bot could be selected.',
                                        )}
                                      </p>
                                    )}
                                  {!botDiagnostics[c.id].publishedFlowCount && (
                                    <p className="notice">
                                      {t(
                                        'انشر بوتًا واربطه بقناة واتساب. ليس مطلوبًا كتابة أي رسالة اختبار خاصة.',
                                        'Publish a flow linked to WhatsApp. No special test keyword is needed.',
                                      )}
                                    </p>
                                  )}
                                </section>
                              )}
                            </details>
                          )}
</div>}{c.widgetSnippet&&<button className="btn" type="button" onClick={()=>install(c)}><NavIcon name="globe"/>{t('تثبيت على الموقع','Install on website')}</button>}</div>}
          {detailTab==='templates'&&c.type==='whatsapp'&&<div className={styles.templatePanel}><span className={styles.platformIcon} data-platform="whatsapp"><NavIcon name="list"/></span><h3>{t('قوالب رسائل WhatsApp','WhatsApp message templates')}</h3><p>{t('إدارة القوالب المعتمدة ومزامنتها من Meta في صفحة القوالب.','Manage and sync approved templates from Meta in the template workspace.')}</p><Link className={styles.primaryAction} href={'/dashboard/channels/'+c.id+'/templates'}><NavIcon name="list"/>{t('إدارة القوالب والمزامنة','Manage & sync templates')}</Link></div>}
          {detailTab==='advanced'&&<div className={styles.advancedPanel}><h3><NavIcon name="settings"/>{t('بيانات الربط والإعدادات','Connection settings')}</h3><div className={styles.technicalRow}><span>{c.type==='whatsapp'?'Phone Number ID':t('معرف الحساب','Account identifier')}</span><bdi>{c.external_id}</bdi></div><div className={styles.technicalRow}><span>{t('المنصة','Platform')}</span><strong>{platformName(c)}</strong></div><Link className={styles.secondaryAction} href={'/dashboard/channels/connect/'+c.type}><NavIcon name="settings"/>{t('إعدادات الربط وإعادة التفويض','Connection setup & authorization')}</Link>{canManage&&<ChannelSettings channel={c} onSaved={load}/>}{canManage&&c.status==='active'&&<div className={styles.dangerZone}><div><strong>{t('الإجراءات الحساسة','Sensitive actions')}</strong><small>{t('فصل الاتصال يوقف القناة محليًا مع الاحتفاظ بالبيانات.','Disconnecting pauses the channel locally and preserves data.')}</small></div><button type="button" className="btn btn-danger" disabled={busy} onClick={()=>setDeleting(c)}><NavIcon name="circleClose"/>{t('فصل الاتصال','Disconnect')}</button></div>}</div>}
        </div>
      </section>})()}
      <Dialog open={availableOpen} onClose={() => setAvailableOpen(false)}
        title={t('اختر منصة للربط', 'Choose a platform to connect')}>
        {availableOpen && <ChannelCatalog />}
      </Dialog>
      <Dialog
        open={!!widget}
        onClose={() => {
          setWidget(null);
          setCopied('');
        }}
        title={t('كود التضمين', 'Get Embed Code')}
      >
        <p>{widget?.name}</p>
        <pre className={styles.embedCode}>{widget?.widgetSnippet}</pre>
        <button
          className="btn btn-primary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(widget!.widgetSnippet!);
              setCopied(widget!.id);
            } catch {
              setError(
                t(
                  'تعذّر نسخ الكود. حدده وانسخه يدويًا.',
                  'Could not copy the code. Select and copy it manually.',
                ),
              );
            }
          }}
        >
          {copied === widget?.id
            ? t('تم النسخ', 'Copied')
            : t('نسخ كود التثبيت', 'Copy installation code')}
        </button>
        <p>
          {t(
            'ضع الكود قبل إغلاق body في موقعك.',
            'Paste the code before the closing body tag on your website.',
          )}
        </p>
      </Dialog>
      <Dialog
        open={!!deleting}
        onClose={() => {
          if (!busy) setDeleting(null);
        }}
        title={t('فصل الحساب عن Boat Two؟', 'Disconnect account from Boat Two?')}
      >
        <p>{deleting?.name}</p>
        <p>
          {t(
            'سيتوقف تشغيل القناة في Boat Two مع الاحتفاظ بالمحادثات والبيانات. لا يلغي ذلك صلاحيات التطبيق لدى المزود.',
            'This pauses the channel in Boat Two and preserves conversations and data. It does not revoke provider app permissions.',
          )}
        </p>
        <div className="form-actions">
          <button className="btn" disabled={busy} onClick={() => setDeleting(null)}>
            {t('إلغاء', 'Cancel')}
          </button>
          <button
            className="btn btn-danger"
            disabled={busy}
            onClick={() => deleting && void remove(deleting.id)}
          >
            {t('تأكيد الفصل', 'Confirm disconnect')}
          </button>
        </div>
      </Dialog>
    </main>
  );
}
