'use client';
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
            {items.map((f) => {
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
                      {f.triggers.map(trig).join(' | ') || t('لا يوجد', 'None')}
                    </small>
                  </div>
                  <span className={`status-pill ${live ? 'is-live' : 'is-draft'}`}>
                    {live
                      ? `${t('منشور', 'Published')} v${f.published_version}`
                      : t('مسودة', 'Draft')}
                  </span>
                  <div className="bot-actions">
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
