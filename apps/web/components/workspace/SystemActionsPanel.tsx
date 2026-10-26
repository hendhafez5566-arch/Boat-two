'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { useData } from '../business/useData';
const actions = [
  ['get_started', 'بدء المحادثة', 'Get Started'],
  ['no_match', 'لا يوجد تطابق', 'No Match'],
  ['location_reply', 'الرد على الموقع', 'Location Reply'],
  ['unsubscribe', 'إلغاء الاشتراك', 'Unsubscribe'],
  ['resubscribe', 'إعادة الاشتراك', 'Resubscribe'],
  ['human', 'التحدث لموظف', 'Chat with Human'],
  ['bot', 'العودة للبوت', 'Chat with Bot'],
] as const;
type Entry = { enabled: boolean; flowId: string | null; keywords: string[] };
type Config = { revision: number; actions: Record<string, Entry> };
export default function SystemActionsPanel({ channelId }: { channelId: string }) {
  const { t } = useLocale();
  const config = useData<Config>(`/channels/${channelId}/system-actions`, {
    revision: 0,
    actions: {},
  });
  const flows = useData<{ id: string; name: string; status: string; channel_ids: string[] }[]>(
    '/flows',
    [],
  );
  const [draft, setDraft] = useState<Config | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    setDraft(config.data);
    setSaved(false);
  }, [config.data]);
  function change(key: string, patch: Partial<Entry>) {
    setSaved(false);
    setDraft((current) =>
      current
        ? {
            ...current,
            actions: {
              ...current.actions,
              [key]: {
                ...(current.actions[key] ?? { enabled: false, flowId: null, keywords: [] }),
                ...patch,
              },
            },
          }
        : current,
    );
  }
  async function save() {
    if (lock.current || !draft) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api<Config>(`/channels/${channelId}/system-actions`, {
        method: 'PUT',
        body: JSON.stringify(draft),
      });
      setDraft(result);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function create(key: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ id: string }>(
        `/channels/${channelId}/system-actions/${key}/draft`,
        { method: 'POST', body: JSON.stringify({ language: t('ar', 'en') }) },
      );
      window.location.assign(
        `/dashboard/flows/${result.id}?channelId=${encodeURIComponent(channelId)}`,
      );
    } catch (e) {
      setError((e as Error).message);
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="stack">
      <header>
        <h2>{t('الإجراءات السريعة', 'Quick Actions')}</h2>
        <p className="muted">
          {t(
            'اربط كل إجراء بتدفق منشور ثم فعّله. كلمات الإجراءات تطابق الرسالة كاملة.',
            'Choose a published flow for each action, then enable it. Keywords match the whole message.',
          )}
        </p>
      </header>
      {(error || config.error || flows.error) && (
        <p className="notice" role="alert">
          {error || config.error || flows.error}
        </p>
      )}
      {saved && <p role="status">{t('تم حفظ الإجراءات.', 'Actions saved.')}</p>}
      <fieldset
        disabled={busy || config.loading || !!config.error}
        style={{ border: 0, padding: 0 }}
        className="stack"
      >
        {actions.map(([key, ar, en]) => {
          const entry = draft?.actions[key] ?? { enabled: false, flowId: null, keywords: [] };
          const keyword = ['unsubscribe', 'resubscribe', 'human', 'bot'].includes(key);
          return (
            <article className="card stack" key={key}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3>{t(ar, en)}</h3>
                <label className="row">
                  <input
                    type="checkbox"
                    checked={entry.enabled}
                    onChange={(e) => change(key, { enabled: e.target.checked })}
                  />
                  {t('مفعّل', 'Enabled')}
                </label>
              </div>
              <label className="field">
                {t('التدفق', 'Flow')}
                <select
                  value={entry.flowId ?? ''}
                  onChange={(e) => change(key, { flowId: e.target.value || null })}
                >
                  <option value="">{t('اختر تدفقًا منشورًا', 'Select a published flow')}</option>
                  {flows.data
                    .filter(
                      (flow) =>
                        flow.status === 'published' &&
                        (!flow.channel_ids.length || flow.channel_ids.includes(channelId)),
                    )
                    .map((flow) => (
                      <option key={flow.id} value={flow.id}>
                        {flow.name}
                      </option>
                    ))}
                </select>
              </label>
              {keyword && (
                <label className="field">
                  {t(
                    'كلمات التفعيل — كلمة أو عبارة في كل سطر',
                    'Trigger keywords — one word or phrase per line',
                  )}
                  <textarea
                    rows={2}
                    value={entry.keywords.join('\n')}
                    onChange={(e) => change(key, { keywords: e.target.value.split('\n') })}
                    onBlur={() =>
                      change(key, { keywords: entry.keywords.map((v) => v.trim()).filter(Boolean) })
                    }
                  />
                </label>
              )}
              <div className="row">
                {entry.flowId && (
                  <Link
                    href={`/dashboard/flows/${entry.flowId}?channelId=${encodeURIComponent(channelId)}`}
                  >
                    {t('تعديل التدفق', 'Edit flow')}
                  </Link>
                )}
                <button type="button" onClick={() => void create(key)}>
                  {t('إنشاء مسودة إجراء', 'Create action draft')}
                </button>
              </div>
            </article>
          );
        })}
        <button type="button" className="primary" onClick={() => void save()}>
          {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ الإجراءات', 'Save Actions')}
        </button>
      </fieldset>
    </section>
  );
}
