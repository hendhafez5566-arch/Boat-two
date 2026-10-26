'use client';
import { useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useData } from '../business/useData';
import { useLocale } from '../product/locale';
import { Button } from '../product/ProductUI';
import styles from './sequences.module.css';
type Audience = {
  includeLabels: string[];
  excludeLabels: string[];
  includeLists: string[];
  excludeLists: string[];
  field?: { key: string; value: string };
};
type Review = {
  reviewId: string;
  expiresAt: string;
  eligible: number;
  sample: { id: string; name: string }[];
  sequenceName: string;
};
export default function SequenceBulkAssign({
  channelId,
  onAssigned,
  onBusyChange,
}: {
  channelId: string;
  onAssigned: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { t } = useLocale();
  const [sequenceSearch, setSequenceSearch] = useState('');
  const sequenceQuery = new URLSearchParams({ q: sequenceSearch, status: 'active', limit: '100' });
  if (channelId) sequenceQuery.set('channelId', channelId);
  const sequences = useData<{
    items: { id: string; name: string; channel_id: string; status: string }[];
    total: number;
  }>(`/sequence-center?${sequenceQuery}`, { items: [], total: 0 });
  const labels = useData<{ label: string; contacts: number }[]>('/labels', []);
  const lists = useData<{ id: string; name: string }[]>('/contact-lists', []);
  const fields = useData<{ key: string; label: string }[]>('/crm/fields', []);
  const [sequenceId, setSequenceId] = useState('');
  const [audience, setAudience] = useState<Audience>({
    includeLabels: [],
    excludeLabels: [],
    includeLists: [],
    excludeLists: [],
  });
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    reviewed: number;
    enrolled: number;
    alreadyActive: number;
    excludedSinceReview: number;
  } | null>(null);
  const lock = useRef(false);
  function change(patch: Partial<Audience>) {
    setAudience((current) => ({ ...current, ...patch }));
    setReview(null);
    setResult(null);
    setError('');
  }
  async function run(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusyChange(true);
    setError('');
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
      setReview(null);
    } finally {
      lock.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }
  const loadError = sequences.error || labels.error || lists.error || fields.error;
  return (
    <div className="stack">
      <p>
        {t(
          'اختر تسلسلًا ثم استهدف المشتركين بالوسوم أو القوائم أو حقل مخصص. شروط الاستبعاد لها الأولوية.',
          'Choose a sequence, then target subscribers by labels, lists or a custom field. Exclusions take priority.',
        )}
      </p>
      {(error || loadError) && (
        <p role="alert" className="notice error">
          {error || loadError}
        </p>
      )}
      <fieldset disabled={busy || !!loadError} className={styles.fieldset}>
        <label className="field">
          {t('بحث اسم التسلسل', 'Search Sequence Name')}
          <input
            type="search"
            value={sequenceSearch}
            onChange={(e) => setSequenceSearch(e.target.value)}
          />
        </label>
        <label className="field">
          {t('اختيار التسلسل', 'Select Sequence')}
          <select
            value={sequenceId}
            onChange={(e) => {
              setSequenceId(e.target.value);
              setReview(null);
              setResult(null);
            }}
          >
            <option value="">{t('اختر تسلسلًا نشطًا', 'Select an Active Sequence')}</option>
            {sequences.data.items
              .filter(
                (sequence) =>
                  sequence.status === 'active' && (!channelId || sequence.channel_id === channelId),
              )
              .map((sequence) => (
                <option key={sequence.id} value={sequence.id}>
                  {sequence.name}
                </option>
              ))}
          </select>
        </label>
        {(['includeLabels', 'excludeLabels', 'includeLists', 'excludeLists'] as const).map(
          (key) => (
            <label key={key} className="field">
              {
                (
                  {
                    includeLabels: t('يتضمن أحد الوسوم', 'Include Any Label'),
                    excludeLabels: t('استبعاد الوسوم', 'Exclude Labels'),
                    includeLists: t('يتضمن إحدى القوائم', 'Include Any Subscriber List'),
                    excludeLists: t('استبعاد القوائم', 'Exclude Subscriber Lists'),
                  } as const
                )[key]
              }
              <select
                multiple
                size={Math.min(
                  4,
                  Math.max(2, key.endsWith('Labels') ? labels.data.length : lists.data.length),
                )}
                value={audience[key]}
                onChange={(e) =>
                  change({ [key]: Array.from(e.target.selectedOptions, (option) => option.value) })
                }
              >
                {key.endsWith('Labels')
                  ? labels.data.map((label) => (
                      <option key={label.label} value={label.label}>
                        {label.label} ({label.contacts})
                      </option>
                    ))
                  : lists.data.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name}
                      </option>
                    ))}
              </select>
            </label>
          ),
        )}
        <div className={styles.twoColumns}>
          <label className="field">
            {t('الحقل المخصص', 'Custom Field')}
            <select
              value={audience.field?.key ?? ''}
              onChange={(e) =>
                change({ field: e.target.value ? { key: e.target.value, value: '' } : undefined })
              }
            >
              <option value="">{t('بدون شرط حقل', 'No Field Condition')}</option>
              {fields.data.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label || field.key}
                </option>
              ))}
            </select>
          </label>
          {audience.field && (
            <label className="field">
              {t('يساوي', 'Equals')}
              <input
                value={audience.field.value}
                onChange={(e) =>
                  change({ field: { key: audience.field!.key, value: e.target.value } })
                }
              />
            </label>
          )}
        </div>
        <p className="muted">
          {t(
            'المراجعة تشمل فقط من وافقوا على الرسائل التسويقية ويمكن الوصول إليهم على حساب التسلسل، مع استبعاد المحظورين والمؤرشفين. يلزم تفعيل التسويق على الحساب.',
            'Review includes only marketing subscribers reachable on the sequence account, excluding blocked and archived contacts. Account marketing must be enabled.',
          )}
        </p>
        <Button
          disabled={!sequenceId}
          busy={busy}
          onClick={() =>
            void run(async () => {
              const result = await api<Review>(`/sequence-center/${sequenceId}/audience-review`, {
                method: 'POST',
                body: JSON.stringify(audience),
              });
              setReview(result);
              setResult(null);
            })
          }
        >
          {t('مراجعة الجمهور', 'Review Audience')}
        </Button>
        {review && !result && (
          <section className="card stack">
            <strong>{review.sequenceName}</strong>
            <p>
              {t('المشتركون المؤهلون', 'Eligible Subscribers')}: {review.eligible}
            </p>
            {review.sample.length > 0 && (
              <p>
                {t('عينة', 'Sample')}:{' '}
                {review.sample.map((contact) => contact.name || contact.id).join('، ')}
              </p>
            )}
            <small>
              {t('تنتهي المراجعة في', 'Review Expires')}:{' '}
              {new Date(review.expiresAt).toLocaleString()}
            </small>
            <Button
              variant="primary"
              disabled={!review.eligible || Date.now() >= new Date(review.expiresAt).getTime()}
              busy={busy}
              onClick={() =>
                void run(async () => {
                  const result = await api<{
                    reviewed: number;
                    enrolled: number;
                    alreadyActive: number;
                    excludedSinceReview: number;
                  }>(`/sequence-center/${sequenceId}/bulk-assign`, {
                    method: 'POST',
                    body: JSON.stringify({ reviewId: review.reviewId }),
                  });
                  setResult(result);
                  onAssigned();
                })
              }
            >
              {t('تعيين التسلسل للمشتركين المراجَعين', 'Assign Sequence to Reviewed Subscribers')}
            </Button>
          </section>
        )}
      </fieldset>
      {result && (
        <div role="status" className="notice">
          <p>
            {t('تم التعيين', 'Assigned')}: {result.enrolled}
          </p>
          <p>
            {t(
              'مشتركون نشطون بالفعل — لم تبدأ متابعتهم من جديد',
              'Already Active — Progress Preserved',
            )}
            : {result.alreadyActive}
          </p>
          <p>
            {t(
              'استُبعدوا بعد المراجعة لتغير الأهلية',
              'Excluded After Review Due to Changed Eligibility',
            )}
            : {result.excludedSinceReview}
          </p>
        </div>
      )}
    </div>
  );
}
