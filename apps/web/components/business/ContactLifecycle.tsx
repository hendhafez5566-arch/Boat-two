'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { useData } from './useData';
type Profile = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  lifecycle: string;
  tags: string[];
  attributes: Record<string, unknown>;
};
type Preview = {
  target: Profile;
  source: Profile;
  counts: Record<string, number>;
  consents: { name: string; source_status: string; target_status: string | null; result: string }[];
  identities: { channel_name: string; target_identity: string; source_identity: string }[];
  overlaps: { target_conversation: string; source_conversation: string }[];
  canMerge: boolean;
};
export function ContactLifecycle({
  act,
  busy,
}: {
  act: (path: string, body?: unknown, method?: string) => Promise<unknown>;
  busy: boolean;
}) {
  const { t } = useLocale();
  const [q, setQ] = useState(''),
    [target, setTarget] = useState(''),
    [source, setSource] = useState(''),
    [preview, setPreview] = useState<Preview | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  const contacts = useData<{ items: { id: string; name: string; email: string | null }[] }>(
    '/crm/contacts?archived=all&limit=100&q=' + encodeURIComponent(q),
    { items: [] },
  );
  return (
    <section className="card stack">
      <h2>{t('معاينة ودمج الملفات المكررة', 'Preview and merge duplicate profiles')}</h2>
      <p>
        {t(
          'تُحفظ السجلات الأصلية وسجلات الحملات. تُفضّل بيانات الملف الأساسي وتغلب حالة الانسحاب أي موافقة متعارضة.',
          'Original records and campaign ledgers are retained. Target profile values win and opt-out wins consent conflicts.',
        )}
      </p>
      <label className="field">
        {t('ابحث بالاسم أو الهاتف أو البريد', 'Search by name, phone or email')}
        <input value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="form-grid">
        {[
          ['target', t('العميل الأساسي', 'Target customer')],
          ['source', t('الملف المكرر', 'Duplicate profile')],
        ].map(([key, label]) => (
          <label className="field" key={key}>
            {label}
            <select
              value={key === 'target' ? target : source}
              onChange={(e) => {
                if (key === 'target') setTarget(e.target.value);
                else setSource(e.target.value);
                setPreview(null);
              }}
            >
              <option value="">{t('اختر ملفًا', 'Choose profile')}</option>
              {contacts.data.items.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name} · {contact.email || contact.id}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <details>
        <summary>{t('اختيار بالمعرّف', 'Select by ID')}</summary>
        <input
          aria-label={t('معرّف الأساسي', 'Target ID')}
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setPreview(null);
          }}
        />
        <input
          aria-label={t('معرّف المكرر', 'Source ID')}
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setPreview(null);
          }}
        />
      </details>
      <button
        className="btn"
        disabled={!target || !source || target === source || loading}
        onClick={async () => {
          setLoading(true);
          setError('');
          try {
            setPreview(
              await api<Preview>('/crm/contacts/' + target + '/merge-preview?sourceId=' + source),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading
          ? t('جارٍ التحميل…', 'Loading…')
          : t('معاينة التأثير والتعارضات', 'Preview impact and conflicts')}
      </button>
      {(error || contacts.error) && <p className="notice error">{error || contacts.error}</p>}
      {preview && (
        <>
          <div className="table-wrap">
            <table className="product-table">
              <thead>
                <tr>
                  <th>{t('الحقل', 'Field')}</th>
                  <th>{t('الأساسي', 'Target')}</th>
                  <th>{t('المكرر', 'Duplicate')}</th>
                </tr>
              </thead>
              <tbody>
                {(['name', 'email', 'phone', 'lifecycle', 'tags', 'attributes'] as const).map(
                  (key) => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td>
                        {typeof preview.target[key] === 'object'
                          ? JSON.stringify(preview.target[key])
                          : preview.target[key] || '—'}
                      </td>
                      <td>
                        {typeof preview.source[key] === 'object'
                          ? JSON.stringify(preview.source[key])
                          : preview.source[key] || '—'}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(preview.counts).map(([name, count]) => (
              <span className="badge" key={name}>
                {name}: {count}
              </span>
            ))}
          </div>
          {preview.consents.map((consent, index) => (
            <p key={index}>
              {consent.name}: {consent.target_status || '—'} + {consent.source_status} →{' '}
              {consent.result}
            </p>
          ))}
          {preview.identities.map((conflict, index) => (
            <p className="notice error" key={index}>
              {t(
                'تعارض هوية القناة؛ يتطلب مراجعة بشرية',
                'Channel identity conflict; manual review required',
              )}
              : {conflict.channel_name} · {conflict.target_identity} / {conflict.source_identity}
            </p>
          ))}
          {preview.overlaps.map((conflict, index) => (
            <p className="notice error" key={index}>
              {t(
                'أغلق إحدى المحادثتين قبل الدمج',
                'Close one overlapping conversation before merging',
              )}
              :{' '}
              <Link
                className="underline"
                href={'/dashboard/inbox?conversation=' + conflict.target_conversation}
              >
                {t('الأساسية', 'Target')}
              </Link>{' '}
              ·{' '}
              <Link
                className="underline"
                href={'/dashboard/inbox?conversation=' + conflict.source_conversation}
              >
                {t('المكررة', 'Duplicate')}
              </Link>
            </p>
          ))}
          {!preview.canMerge && (
            <p className="notice error">
              {t(
                'الدمج محظور حتى معالجة التعارضات أو حالة الملف أو حد الوسوم.',
                'Merge is blocked until conflicts, profile state or tag limits are resolved.',
              )}
            </p>
          )}
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (preview.target.id !== target || preview.source.id !== source) {
                setError(t('حدّث المعاينة قبل الدمج', 'Refresh the preview before merging'));
                return;
              }
              if (
                !confirm(
                  t(
                    'تأكيد الدمج بناءً على المعاينة؟ لا يوجد تراجع آلي.',
                    'Merge based on this preview? Automatic undo is unavailable.',
                  ),
                )
              )
                return;
              try {
                await act('/crm/contacts/' + target + '/merge', {
                  sourceId: source,
                  evidence: f.get('evidence'),
                });
                setPreview(null);
                setSource('');
              } catch {
                /* Parent displays error. */
              }
            }}
          >
            <label className="field">
              {t('دليل التحقق وسبب الدمج', 'Verification evidence and merge reason')}
              <textarea name="evidence" required minLength={10} maxLength={1000} />
            </label>
            <button
              className="btn btn-primary"
              disabled={
                busy ||
                !preview.canMerge ||
                preview.target.id !== target ||
                preview.source.id !== source
              }
            >
              {t('دمج بعد المراجعة', 'Merge after review')}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
