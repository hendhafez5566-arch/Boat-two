'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLocale } from '../../../components/product/locale';
import { api, getSession } from '../../../lib/api';

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

  return (
    <main className="stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('استوديو البوت', 'BOT STUDIO')}</p>
          <h1>{t('مصمم البوت', 'Bot builder')}</h1>
          <p>
            {t(
              'ابدأ بقالب، عدّل محتواه، ثم جرّبه قبل النشر.',
              'Choose a template, customize its content and test before publishing.',
            )}
          </p>
        </div>
      </div>
      <Link className="btn btn-primary mb-6" href="/dashboard/flows/new">
        {t('معالج إنشاء بوت للمبتدئين', 'Beginner bot wizard')} ↗
      </Link>
      <div className="card-grid mb-6">
        {templates.map((x) => (
          <button
            key={x.id}
            className="card text-start"
            style={{ borderColor: templateId === x.id ? '#0f766e' : undefined }}
            onClick={() => setTemplateId(x.id)}
          >
            <span className="badge">
              {x.nodeCount} {t('عقد', 'nodes')}
            </span>
            <h2 className="mt-3">{x.name}</h2>
            <p className="muted">{x.description}</p>
            <span className="muted">
              {templateId === x.id
                ? t('✓ تم الاختيار', '✓ Selected')
                : t('اختيار القالب', 'Select template')}
            </span>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <form onSubmit={create} className="card mb-6 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" name="isComponent" />
          {t('مكوّن قابل لإعادة الاستخدام', 'Reusable component')}
        </label>
        <input
          name="name"
          required
          aria-label={t('اسم البوت', 'Bot name')}
          placeholder={t('اسم سيناريو جديد', 'New bot name')}
          className="flex-1 rounded border p-2"
        />
        <select
          aria-label={t('قالب السيناريو', 'Flow template')}
          className="rounded border p-2"
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
        <button disabled={busy} className="btn btn-primary">
          {busy ? t('جارٍ الإنشاء…', 'Creating…') : t('إنشاء البوت', 'Create bot')}
        </button>
      </form>
      <ul className="flex flex-col gap-3">
        {items.map((f) => (
          <li key={f.id} className="rounded border p-3">
            <div className="flex items-center justify-between">
              <a href={`/dashboard/flows/${f.id}`} className="font-semibold underline">
                {f.name}
              </a>
              <span
                className={`rounded px-2 py-0.5 text-xs ${f.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}
              >
                {f.status === 'published'
                  ? `${t('منشور', 'Published')} v${f.published_version}`
                  : t('مسودة', 'Draft')}
              </span>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {t('المشغّلات:', 'Triggers:')}{' '}
              {f.triggers.map(trig).join(' | ') || t('لا يوجد', 'None')}
            </div>
            <div className="mt-2 flex gap-3 text-xs">
              <button onClick={() => act(`/flows/${f.id}/duplicate`)} className="underline">
                {t('نسخ', 'Duplicate')}
              </button>
              {f.status === 'published' && (
                <button onClick={() => act(`/flows/${f.id}/unpublish`)} className="underline">
                  {t('إيقاف', 'Unpublish')}
                </button>
              )}
              <button
                onClick={() =>
                  confirm(t('حذف السيناريو؟', 'Delete this bot?')) &&
                  act(`/flows/${f.id}`, 'DELETE')
                }
                className="text-red-600 underline"
              >
                {t('حذف', 'Delete')}
              </button>
            </div>
          </li>
        ))}
        {!items.length && (
          <li className="text-gray-500">{t('لا توجد سيناريوهات بعد.', 'No bots yet.')}</li>
        )}
      </ul>
    </main>
  );
}
