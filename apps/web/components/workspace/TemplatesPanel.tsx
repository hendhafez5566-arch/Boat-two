'use client';
import { useState } from 'react';
import Link from 'next/link';
import styles from './whatsapp-templates.module.css';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { TemplateDraftForm, TemplateRow } from '../business/TemplateDraftForm';
import { useData } from '../business/useData';
export default function Templates({ params }: { params: { id: string } }) {
  const { t } = useLocale();
  const path = `/channels/${params.id}/templates`;
  const data = useData<TemplateRow[]>(path, []);
  const availability = useData<{ state: string } | null>(path + '/availability', null);
  const state = availability.data?.state;
  const metaBlocked = state !== 'ready';
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | undefined>();
  const [saved, setSaved] = useState<'draft' | 'sync' | 'submit' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function act(
    url: string,
    body?: unknown,
    method = 'POST',
    action: 'draft' | 'sync' | 'submit' = 'draft',
  ) {
    setBusy(true);
    setError('');
    setSaved(null);
    try {
      await api(url, { method, body: body ? JSON.stringify(body) : undefined });
      await data.reload();
      setSaved(action);
      return true;
    } catch (e) {
      if (action === 'submit') await data.reload();
      const message = (e as Error).message;
      setError(
        message === 'External provider access is disabled by the environment operator'
          ? t(
              'ربط Meta متوقف في هذه البيئة. يمكنك حفظ المسودات محليًا.',
              'Meta access is disabled in this environment. You can still save drafts locally.',
            )
          : message ===
              'Submission outcome requires provider synchronization; automatic retry is disabled'
            ? t(
                'تعذّر تأكيد التقديم لدى Meta. زامن القوالب قبل إعادة المحاولة.',
                'Meta submission could not be confirmed. Sync templates before retrying.',
              )
            : message,
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.page}>
      <Link className={styles.back} href={'/dashboard/channels?manage=' + params.id}>
        {t('العودة إلى قنوات الاتصال', 'Back to channels')}
      </Link>
      <header className={styles.heading}>
        <div>
          <h1>{t('قوالب واتساب', 'WhatsApp templates')}</h1>
          <p>
            {t(
              'جهّز رسائل متكررة مثل تأكيد الحجز. راجع حالة موافقة Meta قبل استخدام القالب.',
              'Prepare messages such as booking confirmations. Check Meta approval before using a template.',
            )}
          </p>
        </div>
        <div className={styles.actions}>
          <button
            className="btn btn-primary"
            disabled={busy || creating || !!editing}
            onClick={() => {
              setError('');
              setSaved(null);
              setCreating(true);
            }}
          >
            {t('+ قالب جديد', '+ New template')}
          </button>
          <button
            className="btn"
            disabled={busy || metaBlocked}
            onClick={() => void act(path + '/sync', undefined, 'POST', 'sync')}
          >
            {t('مزامنة من Meta', 'Sync from Meta')}
          </button>
        </div>
      </header>
      {state === 'environment_disabled' && (
        <div className={styles.info} role="status">
          <strong>{t('اتصال Meta غير متاح هنا', 'Meta connection unavailable here')}</strong>
          <p>
            {t(
              'مزامنة القوالب وإرسالها للمراجعة متوقّفان في هذه البيئة. يمكنك إنشاء المسودات وتعديلها.',
              'Sync and submission are disabled in this environment. You can create and edit drafts.',
            )}
          </p>
        </div>
      )}
      {state === 'account_required' && (
        <div className={styles.info} role="status">
          {t(
            'اربط القناة بحساب واتساب للأعمال لتتمكن من المزامنة والتقديم للمراجعة.',
            'Connect this channel to a WhatsApp Business account to sync and submit templates.',
          )}
        </div>
      )}
      {availability.error && (
        <div className={styles.info}>
          {t('تعذّر التحقق من اتصال Meta.', 'Could not check the Meta connection.')}
          <button type="button" className="btn" onClick={() => void availability.reload()}>
            {t('إعادة المحاولة', 'Retry')}
          </button>
        </div>
      )}
      {saved && (
        <p className="notice" role="status">
          {saved === 'sync'
            ? t('تمت المزامنة.', 'Templates synced.')
            : saved === 'submit'
              ? t('تم تقديم القالب للمراجعة.', 'Template submitted for review.')
              : t('تم حفظ المسودة.', 'Draft saved.')}
        </p>
      )}
      {data.loading && <p role="status">{t('جارٍ تحميل القوالب…', 'Loading templates…')}</p>}
      {(error || data.error) && (
        <p className="notice error" role="alert">
          {error || data.error}
        </p>
      )}
      {(creating || editing) && (
        <TemplateDraftForm
          key={editing ? editing.id + ':' + editing.revision : 'new'}
          initial={editing}
          busy={busy}
          cancel={() => {
            setCreating(false);
            setEditing(undefined);
            setError('');
          }}
          save={async (draft) => {
            const ok = await act(
              editing ? path + '/' + editing.id : path,
              editing ? { revision: editing.revision, draft } : draft,
              editing ? 'PATCH' : 'POST',
            );
            if (ok) {
              setCreating(false);
              setEditing(undefined);
            }
            return ok;
          }}
        />
      )}
      <div className={styles.list}>
        {data.data.map((x) => (
          <section className={styles.template} key={x.id}>
            <span className="badge">
              {(
                {
                  DRAFT: t('مسودة', 'Draft'),
                  PENDING: t('قيد المراجعة', 'Pending review'),
                  APPROVED: t('معتمد', 'Approved'),
                  REJECTED: t('مرفوض', 'Rejected'),
                  SUBMITTING: t(
                    'قيد التقديم؛ زامن إذا تعطل الطلب',
                    'Submitting; sync if interrupted',
                  ),
                  SUBMISSION_UNKNOWN: t(
                    'نتيجة غير مؤكدة؛ زامن قبل المتابعة',
                    'Unknown outcome; sync before continuing',
                  ),
                } as Record<string, string>
              )[x.status] || x.status}
            </span>
            {x.error && (
              <p className="notice" role="status">
                {t(
                  'تحتاج نتيجة التقديم إلى المزامنة قبل أي محاولة أخرى.',
                  'Synchronize the submission outcome before any further attempt.',
                )}
              </p>
            )}
            {!x.supported && (
              <p className="notice">
                {t(
                  'نوع القالب يحتاج دعم مكونات إضافية قبل إرساله.',
                  'This variant needs additional component support before it can be sent.',
                )}
              </p>
            )}
            <h2 className="mt-3">{x.name}</h2>
            <p className="muted">
              {x.language} · {x.category}
            </p>
            {x.components
              .filter((c) => c.type === 'HEADER')
              .map((c, i) => (
                <p key={i} className="font-semibold">
                  {c.format === 'TEXT'
                    ? c.text
                    : `${t('ترويسة وسائط', 'Media header')} · ${c.format}`}
                </p>
              ))}
            <p className="my-3 whitespace-pre-wrap">{x.body}</p>
            {x.components
              .filter((c) => c.type === 'FOOTER')
              .map((c, i) => (
                <p key={i} className="muted">
                  {c.text}
                </p>
              ))}
            <div className="flex flex-wrap gap-2">
              {x.components
                .find((c) => c.type === 'BUTTONS')
                ?.buttons?.map((b, i) => (
                  <span key={i} className="badge">
                    {b.text}
                  </span>
                ))}
            </div>
            {x.status === 'DRAFT' && (
              <button
                className="btn"
                disabled={busy}
                onClick={() => {
                  setCreating(false);
                  setError('');
                  setSaved(null);
                  setEditing(x);
                }}
              >
                {t('تعديل المسودة', 'Edit draft')}
              </button>
            )}
            {x.status === 'DRAFT' && (
              <button
                className="btn"
                disabled={busy || metaBlocked}
                onClick={() => void act(path + '/' + x.id + '/submit', undefined, 'POST', 'submit')}
              >
                {t('تقديم للموافقة لدى Meta', 'Submit for Meta approval')}
              </button>
            )}
          </section>
        ))}
      </div>
      {!data.loading && !data.error && !data.data.length && !creating && (
        <div className={styles.empty}>
          <h2>{t('لا توجد قوالب بعد', 'No templates yet')}</h2>
          <p>{t('ابدأ بقالب جديد واحفظه كمسودة.', 'Create a template and save it as a draft.')}</p>
        </div>
      )}
    </section>
  );
}
