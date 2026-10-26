'use client';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { TemplateDraftForm, TemplateRow } from '../business/TemplateDraftForm';
import { useData } from '../business/useData';
export default function Templates({ params }: { params: { id: string } }) {
  const { t } = useLocale();
  const path = `/channels/${params.id}/templates`;
  const data = useData<TemplateRow[]>(path, []);
  const [editing, setEditing] = useState<TemplateRow | undefined>();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function act(url: string, body?: unknown, method = 'POST') {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await api(url, { method, body: body ? JSON.stringify(body) : undefined });
      await data.reload();
      setSaved(true);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('قوالب واتساب', 'WHATSAPP TEMPLATES')}</p>
          <h1>
            {t('قوالب رسمية، بحالة اعتماد واضحة', 'Official templates, explicit approval status')}
          </h1>
          <p>
            {t(
              'المسودة ليست قالبًا معتمدًا. تتم الموافقة لدى Meta ثم تُزامن حالتها هنا.',
              'A draft is not an approved template. Meta approves it; synchronization imports its status.',
            )}
          </p>
        </div>
        <button className="btn" disabled={busy} onClick={() => act(path + '/sync')}>
          {t('مزامنة من Meta', 'Sync from Meta')}
        </button>
      </div>
      {saved && (
        <p className="notice" role="status">
          {t('حُفظ التغيير.', 'Change saved.')}
        </p>
      )}
      {data.loading && <p role="status">{t('جارٍ تحميل القوالب…', 'Loading templates…')}</p>}
      {(error || data.error) && (
        <p className="notice error" role="alert">
          {error || data.error}
        </p>
      )}
      <p className="notice">
        {t(
          'المزامنة والتقديم يحتاجان WABA ID وصلاحيات Meta وتفعيل الوصول الخارجي بواسطة المشغّل. لا تُرسل القوالب من هذه الصفحة.',
          'Sync and submission require a WABA ID, Meta permissions and operator-enabled external access. This page does not send messages.',
        )}
      </p>
      <div className="card-grid">
        {data.data.map((x) => (
          <section className="card" key={x.id}>
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
              <button className="btn" disabled={busy} onClick={() => setEditing(x)}>
                {t('تعديل المسودة', 'Edit draft')}
              </button>
            )}
            {x.status === 'DRAFT' && (
              <button
                className="btn"
                disabled={busy}
                onClick={() => act(path + '/' + x.id + '/submit')}
              >
                {t('تقديم للموافقة لدى Meta', 'Submit for Meta approval')}
              </button>
            )}
          </section>
        ))}
      </div>
      {!data.loading && !data.data.length && (
        <p className="empty">
          {t('أنشئ مسودة أو زامن القوالب المعتمدة.', 'Create a draft or sync approved templates.')}
        </p>
      )}
      <TemplateDraftForm
        key={editing ? editing.id + ':' + editing.revision : 'new'}
        initial={editing}
        busy={busy}
        cancel={editing ? () => setEditing(undefined) : undefined}
        save={async (draft) => {
          const ok = await act(
            editing ? path + '/' + editing.id : path,
            editing ? { revision: editing.revision, draft } : draft,
            editing ? 'PATCH' : 'POST',
          );
          if (ok) setEditing(undefined);
          return ok;
        }}
      />
    </section>
  );
}
