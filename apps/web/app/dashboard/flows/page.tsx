'use client';
import {useChannelContext} from '../../../components/product/useChannelContext';
import {useData} from '../../../components/business/useData';
import {channelHref,matchesFlowChannel} from '../../../lib/channel-context';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLocale } from '../../../components/product/locale';
import { api, getSession } from '../../../lib/api';
import { NavIcon } from '../../../components/product/NavIcon';
import { EmptyState } from '../../../components/product/ProductUI';

type Flow = {
  id: string;
  name: string;
  status: 'draft' | 'published';
  published_version: number | null;
  triggers: { type: string; keywords?: string[] }[];
  updated_at: string;
  folder_name: string | null;
  channel_ids:string[];
};

export default function Flows() {
  const { t, language } = useLocale();
  const trig = (trigger: Flow['triggers'][number]) =>
    trigger.type === 'keyword'
      ? `${t('كلمات', 'Keywords')}: ${(trigger.keywords ?? []).slice(0, 3).join(', ')}`
      : ((
          {
            first_message: t('أول رسالة', 'First message'),
            any_message: t('أي رسالة', 'Any message'),
            reply_id: t('زر محدد', 'Specific reply'),
            event: t('حدث أعمال', 'Business event'),
          } as Record<string, string>
        )[trigger.type] ?? trigger.type);
  const [templates, setTemplates] = useState<
    { id: string; name: string; description: string; nodeCount: number }[]
  >([]);
  const [templateId, setTemplateId] = useState('');
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Flow[]>([]);
  const [error, setError] = useState('');
  const [folder, setFolder] = useState('*');
  const [search, setSearch] = useState('');
  const [channelId,setChannelId]=useChannelContext();
  const channels=useData<{id:string;name:string;type:string}[]>('/channels',[]);
  const visible = items.filter(f => matchesFlowChannel(f.channel_ids,channelId) && (folder === '*' || (f.folder_name ?? '') === folder) && f.name.toLowerCase().includes(search.toLowerCase()));
  const folders = [...new Set(items.map(f => f.folder_name).filter((f): f is string => !!f))];

  async function importFile(file: File) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (file.size > 1024 * 1024) throw new Error(t('حجم الملف يتجاوز 1 ميجابايت.', 'File exceeds 1 MB.'));
      let body: unknown;
      try { body = JSON.parse(await file.text()); } catch { throw new Error(t('الملف ليس JSON صالحًا.', 'File is not valid JSON.')); }
      const flow = await api<{id:string}>('/flows/import', { method:'POST', body:JSON.stringify(body) });
      window.location.assign(`/dashboard/flows/${flow.id}`);
    } catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function exportFlow(flow: Flow) {
    if (busy) return; setBusy(true); setError('');
    try {
      const body = await api(`/flows/${flow.id}/export`);
      const url=URL.createObjectURL(new Blob([JSON.stringify(body,null,2)], {type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download=`boat-flow-${flow.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const load = () =>
    api<Flow[]>('/flows')
      .then(setItems)
      .catch((e) => setError(e.message));
  useEffect(() => {
    if (!getSession()) {
      window.location.href = '/login';
      return;
    }
    load();
    api<typeof templates>('/flows/templates?language=' + language)
      .then(setTemplates)
      .catch((e) => setError(e.message));
  }, [language]);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const flow = await api<Flow>('/flows', {
        method: 'POST',
        body: JSON.stringify({
          language,
          name: f.get('name'),
          isComponent: f.get('isComponent') === 'on',
          ...(templateId ? { templateId } : {}),
        }),
      });
      window.location.href = `/dashboard/flows/${flow.id}`;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const act = async (path: string, method = 'POST') => {
    await api(path, { method }).catch((e) => setError(e.message));
    load();
  };

  const published = items.filter((f) => f.status === 'published').length;
  return (
    <main className="stack">
      <div className="page-heading">
        <div>
          <h1>{t('مصمم البوت', 'Bot builder')}</h1>
          <p>
            {t(
              'أنشئ بوتات تحادث عملاءك، وعدّلها بالسحب والإفلات، وجرّبها قبل النشر.',
              'Create bots that talk to your customers, edit them by drag and drop, and test before you publish.',
            )}
          </p>
        </div>
        <Link className="btn btn-primary btn-lg" href="/dashboard/flows/new">
          <NavIcon name="ai" />
          {t('إنشاء بوت جديد', 'Create a new bot')}
        </Link>
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}

      <section aria-labelledby="my-bots">
        <div className="card stack">{channels.error&&<p role="alert">{channels.error}</p>}<div className="form-grid"><label className="field">{t('اختر القناة أولًا','Choose a channel first')}<select value={channelId} onChange={e=>setChannelId(e.target.value)}><option value="">{t('كل القنوات','All channels')}</option>{channels.data.map(c=><option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}</select></label><label className="field">{t('بحث عن بوت', 'Find a bot')}<input type="search" value={search} onChange={e=>setSearch(e.target.value)} /></label><label className="field">{t('المجلد', 'Folder')}<select value={folder} onChange={e=>setFolder(e.target.value)}><option value="*">{t('كل المجلدات', 'All folders')}</option><option value="">{t('دون مجلد', 'Unfiled')}</option>{folders.map(name=><option key={name} value={name}>{name}</option>)}</select></label><label className="field">{t('استيراد ملف Boat Two', 'Import Boat Two file')}<input type="file" accept="application/json,.json" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void importFile(file);}} /></label></div><p>{t('الاستيراد ينشئ مسودة جديدة دون نشر أو ربط قناة. تبقى معرّفات الخطوات والأزرار ثابتة؛ راجع مراجع القوائم والتسلسلات والموظفين والـWebhook قبل النشر.', 'Import creates a new draft without publishing or connecting channels. Step and button IDs are preserved; review list, sequence, staff and webhook references before publishing.')}</p></div>
        <div className="section-title">
          <h2 id="my-bots">{t('بوتاتك', 'Your bots')}</h2>
          {items.length > 0 && (
            <span>
              {items.length} {t('بوت', 'bots')} · {published} {t('منشور', 'live')}
            </span>
          )}
        </div>
        {items.length ? (
          <ul className="bot-list">
            {visible.map((f) => {
              const live = f.status === 'published';
              return (
                <li key={f.id} className="bot-row">
                  <span className={`bot-avatar ${live ? '' : 'is-draft'}`}>
                    <NavIcon name="flows" />
                  </span>
                  <div className="bot-main">
                    <a href={`/dashboard/flows/${f.id}`}>{f.name}</a>
                    <small>
                      {t('المشغّلات:', 'Triggers:')}{' '}
                      {f.triggers.map(trig).join(' | ') || t('لا يوجد', 'None')}<br/>{f.channel_ids.length?channels.data.filter(c=>f.channel_ids.includes(c.id)).map(c=>c.name).join(' · ')||t('قنوات مرتبطة','Bound channels'):t('كل القنوات (دون تقييد)','All channels (unrestricted)')}
                    </small>
                  </div>
                  <span className={`status-pill ${live ? 'is-live' : 'is-draft'}`}>
                    {live
                      ? `${t('منشور', 'Published')} v${f.published_version}`
                      : t('مسودة', 'Draft')}
                  </span>
                  <div className="bot-actions">
                    <Link className="btn" href={channelHref(`/dashboard/flows/${f.id}/workspace`,channelId)}>{t('مساحة عمل البوت', 'Bot workspace')}</Link>
                    <button className="btn" disabled={busy} onClick={()=>void exportFlow(f)}>{t('تصدير', 'Export')}</button>
                    <details><summary>{t('المجلد', 'Folder')}: {f.folder_name || t('دون مجلد', 'Unfiled')}</summary><form className="stack" onSubmit={async e=>{e.preventDefault();if(busy)return;const form=e.currentTarget;setBusy(true);setError('');try{await api(`/flows/${f.id}`,{method:'PATCH',body:JSON.stringify({folderName:String(new FormData(form).get('folder')??'').trim()||null,expectedUpdatedAt:f.updated_at})});await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><label className="field">{t('اسم المجلد (فارغ للإزالة)', 'Folder name (empty to remove)')}<input name="folder" defaultValue={f.folder_name??''} maxLength={80}/></label><button className="btn" disabled={busy}>{t('حفظ المجلد', 'Save folder')}</button></form></details>
                    <a className="btn btn-primary" href={`/dashboard/flows/${f.id}`}>
                      {t('تعديل', 'Edit')}
                    </a>
                    <button className="btn" onClick={() => act(`/flows/${f.id}/duplicate`)}>
                      {t('نسخ', 'Duplicate')}
                    </button>
                    {live && (
                      <button className="btn" onClick={() => act(`/flows/${f.id}/unpublish`)}>
                        {t('إيقاف', 'Unpublish')}
                      </button>
                    )}
                    <button
                      className="btn btn-danger"
                      onClick={() =>
                        confirm(t('حذف السيناريو؟', 'Delete this bot?')) &&
                        act(`/flows/${f.id}`, 'DELETE')
                      }
                    >
                      {t('حذف', 'Delete')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="card">
            <EmptyState
              icon="flows"
              title={t('لا توجد بوتات بعد', 'No bots yet')}
              description={t(
                'ابدأ بالمعالج الموجّه أو اختر قالبًا جاهزًا من الأسفل.',
                'Start with the guided wizard or pick a ready-made template below.',
              )}
              action={
                <Link className="btn btn-primary" href="/dashboard/flows/new">
                  {t('إنشاء أول بوت', 'Create your first bot')}
                </Link>
              }
            />
          </div>
        )}
        {items.length > 0 && visible.length === 0 && <p className="empty">{t('لا توجد نتائج لهذه القناة أو البحث أو المجلد.', 'No results for this channel, search or folder.')}</p>}
      </section>

      <section aria-labelledby="start-template">
        <div className="section-title">
          <h2 id="start-template">{t('ابدأ من قالب جاهز', 'Start from a template')}</h2>
          <span>{t('اختر قالبًا ثم سمِّ البوت', 'Pick a template, then name your bot')}</span>
        </div>
        <div className="template-gallery">
          {templates.map((x) => (
            <button
              type="button"
              key={x.id}
              className={`template-card ${templateId === x.id ? 'is-selected' : ''}`}
              aria-pressed={templateId === x.id}
              onClick={() => setTemplateId(templateId === x.id ? '' : x.id)}
            >
              <span className="tile-icon">
                <NavIcon name="flows" />
              </span>
              <strong>{x.name}</strong>
              <p>{x.description}</p>
              <footer>
                <span>
                  {x.nodeCount} {t('عقد', 'nodes')}
                </span>
                <span>
                  {templateId === x.id
                    ? t('✓ تم الاختيار', '✓ Selected')
                    : t('اختيار القالب', 'Select template')}
                </span>
              </footer>
            </button>
          ))}
        </div>
        <form onSubmit={create} className="card create-bar">
          <input
            name="name"
            required
            aria-label={t('اسم البوت', 'Bot name')}
            placeholder={t('اسم البوت الجديد', 'New bot name')}
          />
          <select
            aria-label={t('قالب السيناريو', 'Flow template')}
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">{t('سيناريو فارغ', 'Blank flow')}</option>
            {templates.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <label>
            <input type="checkbox" name="isComponent" />
            {t('مكوّن قابل لإعادة الاستخدام', 'Reusable component')}
          </label>
          <button disabled={busy} className="btn btn-primary">
            {busy ? t('جارٍ الإنشاء…', 'Creating…') : t('إنشاء البوت', 'Create bot')}
          </button>
        </form>
      </section>
    </main>
  );
}
