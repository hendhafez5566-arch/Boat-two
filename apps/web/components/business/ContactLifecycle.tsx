'use client';
import { DisclosureSummary } from '../product/DisclosureSummary';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { useData } from './useData';
import { statusLabel } from '../product/status';
import product from './crm-product.module.css';
type Profile = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  lifecycle: string;
  tags: string[];
  attributes: Record<string, unknown>;
};
type Candidate = { id: string; name: string; email: string | null };
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
  const [match, setMatch] = useState<string | null>(null);
  const duplicates = useData<
    { kind: string; value: string; count: number; members?: Candidate[] }[]
  >('/crm/contacts/duplicates', []);
  const contacts = useData<{ items: Candidate[] }>(
    '/crm/contacts?archived=all&limit=100&q=' + encodeURIComponent(q),
    { items: [] },
  );
  const matched = duplicates.data.find((group) => group.kind + ':' + group.value === match);
  const candidates = matched?.members ?? contacts.data.items;
  return (
    <section className="card stack">
      <h2>{t('معاينة ودمج الملفات المكررة', 'Preview and merge duplicate profiles')}</h2>
      <p>
        {t(
          'تُحفظ السجلات الأصلية وسجلات الحملات. تُفضّل بيانات الملف الأساسي وتغلب حالة الانسحاب أي موافقة متعارضة.',
          'Original records and campaign ledgers are retained. Target profile values win and opt-out wins consent conflicts.',
        )}
      </p>
      <details>
        <DisclosureSummary>{t('التطابقات المكتشفة', 'Detected matches')}</DisclosureSummary>
        {duplicates.error && <p role="alert">{duplicates.error}</p>}
        {!duplicates.loading && !duplicates.error && !duplicates.data.length && (
          <p>{t('لا توجد تطابقات', 'No matches found')}</p>
        )}
        <div className="form-actions">
          {duplicates.data.map((group) => (
            <button
              type="button"
              className="btn"
              key={group.kind + ':' + group.value}
              disabled={loading || busy}
              onClick={() => {
                setMatch(group.kind + ':' + group.value);
                setQ(group.value);
                setTarget('');
                setSource('');
                setPreview(null);
              }}
            >
              <bdi>{group.value}</bdi> · {group.count}
            </button>
          ))}
        </div>
      </details>
      <label className="field">
        {t('ابحث بالاسم أو الهاتف أو البريد', 'Search by name, phone or email')}
        <input
          value={q}
          onChange={(e) => {
            setMatch(null);
            setQ(e.target.value);
          }}
        />
      </label>
      <div className="form-grid">
        {[
          ['target', t('العميل الأساسي', 'Target customer')],
          ['source', t('الملف المكرر', 'Duplicate profile')],
        ].map(([key, label]) => (
          <label className="field" key={key}>
            {label}
            <select
              disabled={loading || busy}
              value={key === 'target' ? target : source}
              onChange={(e) => {
                if (key === 'target') setTarget(e.target.value);
                else setSource(e.target.value);
                setPreview(null);
              }}
            >
              <option value="">{t('اختر ملفًا', 'Choose profile')}</option>
              {candidates.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name} · {contact.email || '—'}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <details>
        <DisclosureSummary>{t('اختيار بالمعرّف', 'Select by ID')}</DisclosureSummary>
        <input
          aria-label={t('معرّف الأساسي', 'Target ID')}
          disabled={loading || busy}
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setPreview(null);
          }}
        />
        <input
          aria-label={t('معرّف المكرر', 'Source ID')}
          disabled={loading || busy}
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
          <div className={product.columns}>
            {(
              [
                [preview.target, t('الملف الأساسي', 'Target profile')],
                [preview.source, t('الملف المكرر', 'Duplicate profile')],
              ] as const
            ).map(([record, title]) => (
              <section key={record.id} className={product.group}>
                <h2>{title}</h2>
                <div className={product.profileTools}>
                  <dl>
                    <dt>{t('الاسم', 'Name')}</dt>
                    <dd>{record.name}</dd>
                    <dt>{t('البريد الإلكتروني', 'Email')}</dt>
                    <dd>
                      <bdi>{record.email || '—'}</bdi>
                    </dd>
                    <dt>{t('الهاتف', 'Phone')}</dt>
                    <dd>
                      <bdi>{record.phone || '—'}</bdi>
                    </dd>
                    <dt>{t('الحالة', 'Lifecycle')}</dt>
                    <dd>{statusLabel(record.lifecycle, t)}</dd>
                    <dt>{t('الوسوم', 'Labels')}</dt>
                    <dd>{record.tags.join(' · ') || '—'}</dd>
                  </dl>
                </div>
                {!!Object.keys(record.attributes).length && (
                  <details>
                    <summary>{t('البيانات الإضافية', 'Additional data')}</summary>
                    <dl>
                      {Object.entries(record.attributes).map(([key, value]) => (
                        <div key={key}>
                          <dt>{key}</dt>
                          <dd>{value == null ? '—' : String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              </section>
            ))}
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
                void duplicates.reload();
                void contacts.reload();
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
