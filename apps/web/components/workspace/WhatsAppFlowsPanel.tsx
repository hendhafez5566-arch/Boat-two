'use client';
import { useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { Button, Dialog, EmptyState } from '../product/ProductUI';
import { useData } from '../business/useData';
import { NATIVE_FLOW_CATEGORIES, NativeFlowRow } from '../../lib/whatsapp-flow-builder';
import NativeFlowDesigner from './NativeFlowDesigner';
import styles from './native-flows.module.css';
type Action = 'create' | 'upload' | 'publish' | 'deprecate';
export default function WhatsAppFlowsPanel({ channelId }: { channelId: string }) {
  const { t } = useLocale();
  const path = `/channels/${channelId}/whatsapp-flows`;
  const rows = useData<NativeFlowRow[]>(path, []);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [editor, setEditor] = useState<NativeFlowRow | 'new' | null>(null);
  const [name, setName] = useState('');
  const [categories, setCategories] = useState<string[]>(['LEAD_GENERATION']);
  const [json, setJson] = useState('');
  const [design, setDesign] = useState(true);
  const [reconciling, setReconciling] = useState<NativeFlowRow | null>(null);
  const [receipt, setReceipt] = useState('');
  const [confirm, setConfirm] = useState<{ row: NativeFlowRow; action: Action } | null>(null);
  const [preview, setPreview] = useState<{ url: string; expiresAt: string; name: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const filtered = rows.data.filter(
    (row) =>
      (status === 'all' || row.provider_status === status) &&
      `${row.name} ${row.provider_id ?? ''}`.toLowerCase().includes(q.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / limit));
  const current = Math.min(page, pages);
  function open(row: NativeFlowRow | 'new') {
    setError('');
    setNotice('');
    setEditor(row);
    setName(row === 'new' ? '' : row.name);
    setCategories(row === 'new' ? ['LEAD_GENERATION'] : row.categories);
    setJson(row === 'new' ? '' : row.definition ? JSON.stringify(row.definition, null, 2) : '');
    setDesign(row === 'new');
  }
  async function run<T>(task: () => Promise<T>, done?: (result: T) => void) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await task();
      done?.(result);
      await rows.reload();
      return true;
    } catch (e) {
      setError((e as Error).message);
      await rows.reload();
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function save() {
    let definition: unknown;
    try {
      definition = JSON.parse(json);
    } catch {
      setError(
        t(
          'استخدم التصميم أو أدخل تعريف JSON صحيحًا أولًا.',
          'Use the designer or enter a valid JSON definition first.',
        ),
      );
      return;
    }
    await run(
      () =>
        api(path + (editor && editor !== 'new' ? `/${editor.id}` : ''), {
          method: editor === 'new' ? 'POST' : 'PATCH',
          body: JSON.stringify(
            editor === 'new'
              ? { name, categories, definition }
              : { revision: editor?.revision, draft: { name, categories, definition } },
          ),
        }),
      () => {
        setEditor(null);
        setNotice(t('حُفظت المسودة محليًا.', 'Local draft saved.'));
      },
    );
  }
  async function perform(row: NativeFlowRow, action: Action) {
    const ok = await run(
      () =>
        api(`${path}/${row.id}/actions/${action}`, {
          method: 'POST',
          body: JSON.stringify({ revision: row.revision }),
        }),
      () => {
        setConfirm(null);
        setNotice(
          t(
            'اكتملت الخطوة. راجع الحالة وأخطاء التحقق قبل الخطوة التالية.',
            'Step completed. Review status and validation errors before continuing.',
          ),
        );
      },
    );
    if (!ok) setConfirm(null);
  }
  function refresh(row: NativeFlowRow) {
    void run(
      () =>
        api<{ preview: { url: string | null; expiresAt: string } | null }>(
          `${path}/${row.id}/refresh`,
          { method: 'POST' },
        ),
      (result) => {
        if (result.preview?.url)
          setPreview({
            url: result.preview.url,
            expiresAt: result.preview.expiresAt,
            name: row.name,
          });
        else
          setNotice(
            t(
              'تم تحديث الحالة. لا يوجد رابط معاينة متاح.',
              'Status refreshed. No preview URL is available.',
            ),
          );
      },
    );
  }
  const actionLabels: Record<Action, string> = {
    create: t('تسجيل لدى Meta', 'Register with Meta'),
    upload: t('رفع وفحص النموذج', 'Upload & Validate'),
    publish: t('نشر النموذج', 'Publish Flow'),
    deprecate: t('إيقاف النموذج', 'Deprecate Flow'),
  };
  const feedback = (error || rows.error) && (
    <p role="alert" className="notice error">
      {error || rows.error}
    </p>
  );
  return (
    <section className="stack">
      <div className={styles.toolbar}>
        <div>
          <h2>{t('نماذج WhatsApp', 'WhatsApp Flows')}</h2>
          <p className="muted">
            {t(
              'إدارة النماذج التفاعلية الأصلية للحساب المختار.',
              'Manage native interactive Flows for the selected account.',
            )}
          </p>
        </div>
        <div className={styles.tools}>
          <Button
            busy={busy}
            onClick={() =>
              void run(
                () =>
                  api<{ synced: number; complete: boolean }>(`${path}/sync`, { method: 'POST' }),
                (result) =>
                  setNotice(
                    `${t('تمت مزامنة', 'Synced')} ${result.synced}${result.complete ? '' : t(' — توجد صفحات إضافية لدى المزود.', ' — additional provider pages remain.')}`,
                  ),
              )
            }
          >
            {t('مزامنة', 'Sync')}
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => open('new')}>
            ＋ {t('إنشاء', 'Create')}
          </Button>
        </div>
      </div>
      {feedback}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <div className={styles.steps}>
        <span>1 · {t('تصميم وحفظ', 'Design & Save')}</span>
        <span>2 · {t('تسجيل ورفع', 'Register & Upload')}</span>
        <span>3 · {t('معاينة ونشر', 'Preview & Publish')}</span>
      </div>
      <div className={styles.toolbar}>
        <input
          type="search"
          aria-label={t('البحث في النماذج', 'Search Flows')}
          placeholder={t('ابحث بالاسم أو المعرّف', 'Search name or ID')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label={t('الحالة', 'Status')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          {[
            ['all', t('كل الحالات', 'All Statuses')],
            ['LOCAL_DRAFT', t('مسودة محلية', 'Local Draft')],
            ['DRAFT', t('مسودة لدى Meta', 'Meta Draft')],
            ['PUBLISHED', t('منشور', 'Published')],
            ['DEPRECATED', t('متوقف', 'Deprecated')],
            ['BLOCKED', t('محظور لدى المزود', 'Provider Blocked')],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {rows.loading ? (
        <p role="status">{t('جارٍ تحميل النماذج…', 'Loading Flows…')}</p>
      ) : !filtered.length ? (
        <EmptyState
          icon="flows"
          title={t('لا توجد نماذج مطابقة', 'No Matching Flows')}
          description={t(
            'أنشئ نموذجًا أو زامن نماذج هذا الحساب من Meta.',
            'Create a Flow or synchronize this account’s Flows from Meta.',
          )}
        />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {[
                    '#',
                    t('الاسم والمعرّف', 'Flow Name / ID'),
                    t('الفئة', 'Category'),
                    t('الحالة', 'Status'),
                    t('الإجراءات', 'Actions'),
                    t('تاريخ الإنشاء', 'Created At'),
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice((current - 1) * limit, current * limit).map((row, index) => (
                  <tr key={row.id}>
                    <td>{(current - 1) * limit + index + 1}</td>
                    <td>
                      <strong>{row.name}</strong>
                      <small dir="ltr">{row.provider_id ?? t('محلي فقط', 'Local Only')}</small>
                    </td>
                    <td>{row.categories.join(', ')}</td>
                    <td>
                      <span className="badge">{row.provider_status}</span>
                      {row.operation && (
                        <small>
                          {row.operation} · {row.operation_state}
                        </small>
                      )}
                      {row.error && <small role="status">{row.error}</small>}
                      {row.validation_errors.length > 0 && (
                        <details>
                          <summary>
                            {t('أخطاء التحقق', 'Validation Errors')} ({row.validation_errors.length}
                            )
                          </summary>
                          <pre className={styles.errors}>
                            {JSON.stringify(row.validation_errors, null, 2)}
                          </pre>
                        </details>
                      )}
                    </td>
                    <td>
                      <div className={styles.tools}>
                        {!row.operation &&
                          ['LOCAL_DRAFT', 'DRAFT'].includes(row.provider_status) && (
                            <Button disabled={busy} onClick={() => open(row)}>
                              {t('تعديل', 'Edit')}
                            </Button>
                          )}
                        {row.operation === 'create' && !row.provider_id && (
                          <Button
                            disabled={busy}
                            onClick={() => {
                              setReconciling(row);
                              setReceipt('');
                              setError('');
                            }}
                          >
                            {t('تسوية التسجيل', 'Reconcile Registration')}
                          </Button>
                        )}
                        {row.definition && (
                          <Button
                            disabled={busy}
                            onClick={() => {
                              open('new');
                              setName(`${row.name} (${t('نسخة', 'Copy')})`);
                              setCategories(row.categories);
                              setJson(JSON.stringify(row.definition, null, 2));
                              setDesign(false);
                            }}
                          >
                            {t('نسخ', 'Duplicate')}
                          </Button>
                        )}
                        {!row.operation && !row.provider_id && (
                          <Button
                            disabled={busy}
                            onClick={() => setConfirm({ row, action: 'create' })}
                          >
                            {actionLabels.create}
                          </Button>
                        )}
                        {row.provider_id && (
                          <Button disabled={busy} onClick={() => refresh(row)}>
                            {t('معاينة وتحديث', 'Preview / Refresh')}
                          </Button>
                        )}
                        {!row.operation &&
                          row.provider_id &&
                          row.provider_status === 'DRAFT' &&
                          row.definition && (
                            <>
                              <Button
                                disabled={busy}
                                onClick={() => setConfirm({ row, action: 'upload' })}
                              >
                                {actionLabels.upload}
                              </Button>
                              <Button
                                disabled={busy || row.validation_errors.length > 0}
                                onClick={() => setConfirm({ row, action: 'publish' })}
                              >
                                {actionLabels.publish}
                              </Button>
                            </>
                          )}
                        {!row.operation && row.provider_status === 'PUBLISHED' && (
                          <Button
                            disabled={busy}
                            onClick={() => setConfirm({ row, action: 'deprecate' })}
                          >
                            {actionLabels.deprecate}
                          </Button>
                        )}
                      </div>
                    </td>
                    <td>{new Date(row.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.pagination}>
            <span>
              {filtered.length} {t('نموذج', 'Flows')} · {current} / {pages}
            </span>
            <label>
              {t('عدد الصفوف', 'Rows')}{' '}
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
              >
                {[10, 25, 50, 100].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <div className={styles.tools}>
              <Button disabled={current === 1} onClick={() => setPage(current - 1)}>
                {t('السابق', 'Previous')}
              </Button>
              <Button disabled={current === pages} onClick={() => setPage(current + 1)}>
                {t('التالي', 'Next')}
              </Button>
            </div>
          </div>
        </>
      )}
      <Dialog
        open={editor !== null}
        onClose={() => {
          if (!busy) setEditor(null);
        }}
        title={
          editor === 'new'
            ? t('إنشاء نموذج WhatsApp', 'Create WhatsApp Flow')
            : t('تعديل النموذج', 'Edit Flow')
        }
        className={styles.wide}
      >
        {feedback}
        <fieldset disabled={busy} style={{ border: 0, padding: 0 }} className="stack">
          <div className={styles.formMeta}>
            <label className="field">
              {t('اسم النموذج', 'Flow Name')}
              <input
                required
                value={name}
                maxLength={200}
                disabled={editor !== 'new' && !!editor?.provider_id}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <fieldset>
              <legend>{t('فئات النموذج', 'Flow Categories')}</legend>
              <div className={styles.tools}>
                {NATIVE_FLOW_CATEGORIES.map((category) => (
                  <label className="row" key={category}>
                    <input
                      type="checkbox"
                      checked={categories.includes(category)}
                      disabled={editor !== 'new' && !!editor?.provider_id}
                      onChange={(e) =>
                        setCategories((current) =>
                          e.target.checked
                            ? [...current, category]
                            : current.filter((value) => value !== category),
                        )
                      }
                    />
                    {category.replaceAll('_', ' ')}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          {editor === 'new' && (
            <div className={styles.tools}>
              <Button disabled={design} onClick={() => setDesign(true)}>
                {t('مصمم النموذج', 'Form Designer')}
              </Button>
              <Button disabled={!design} onClick={() => setDesign(false)}>
                JSON
              </Button>
            </div>
          )}
          {design ? (
            <NativeFlowDesigner
              onUse={(definition) => {
                setJson(JSON.stringify(definition, null, 2));
                setDesign(false);
              }}
              disabled={busy}
            />
          ) : (
            <label className="field">
              {t('تعريف النموذج', 'Flow Definition')}
              <textarea
                className={styles.code}
                dir="ltr"
                spellCheck={false}
                value={json}
                onChange={(e) => setJson(e.target.value)}
              />
            </label>
          )}
          {!design && (
            <>
              <p className="muted">
                {t(
                  'الحفظ ينشئ مسودة محلية. التحقق النهائي وصلاحية النشر يحددهما Meta. للرد بعد إرسال النموذج، استخدم عقدة WhatsApp Flow داخل محرر المحادثة ووصل مسار الإكمال برسالة الرد.',
                  'Saving creates a local draft. Meta determines final validation and publishing eligibility. To reply after submission, use a WhatsApp Flow node in the conversation editor and connect its completion path to a reply.',
                )}
              </p>
              <Button variant="primary" busy={busy} onClick={() => void save()}>
                {t('حفظ المسودة', 'Save Draft')}
              </Button>
            </>
          )}
        </fieldset>
      </Dialog>
      <Dialog
        open={!!confirm}
        onClose={() => {
          if (!busy) setConfirm(null);
        }}
        title={confirm ? actionLabels[confirm.action] : ''}
      >
        {feedback}
        {confirm && (
          <div className="stack">
            <p>
              <strong>{confirm.row.name}</strong>
            </p>
            <p>
              {confirm.action === 'publish'
                ? t(
                    'النشر يجعل النموذج متاحًا للاستخدام ويجمّد تعريفه لدى Meta. افحص رابط المعاينة قبل المتابعة. لتعديله لاحقًا، أنشئ نسخة جديدة.',
                    'Publishing makes the Flow available and freezes its definition at Meta. Check its preview first. Future definition changes require a new Flow.',
                  )
                : confirm.action === 'deprecate'
                  ? t(
                      'هذا الإجراء يوقف استخدام النموذج المنشور ولا يمكن التراجع عنه لدى Meta.',
                      'This deprecates the published Flow and cannot be reversed at Meta.',
                    )
                  : confirm.action === 'create'
                    ? t(
                        'سيُسجّل اسم النموذج وفئاته في حساب Meta المرتبط. لن ينشر النموذج أو يرسل رسائل.',
                        'Registers the Flow name and categories with the connected Meta account. This does not publish the Flow or send messages.',
                      )
                    : t(
                        'سيُرفع تعريف JSON الحالي إلى Meta وتظهر أخطاء الفحص هنا.',
                        'Uploads the current JSON definition to Meta and displays its validation errors here.',
                      )}
            </p>
            <Button
              variant={confirm.action === 'deprecate' ? 'danger' : 'primary'}
              busy={busy}
              onClick={() => perform(confirm.row, confirm.action)}
            >
              {actionLabels[confirm.action]}
            </Button>
          </div>
        )}
      </Dialog>
      <Dialog
        open={!!reconciling}
        onClose={() => {
          if (!busy) setReconciling(null);
        }}
        title={t('تسوية تسجيل غير مؤكد', 'Reconcile Uncertain Registration')}
      >
        {feedback}
        {reconciling && (
          <div className="stack">
            <strong>{reconciling.name}</strong>
            <p>
              {t(
                'افحص النموذج في Meta أو زامن قائمة النماذج، ثم أدخل معرّفه المؤكد. نتحقق من الحساب والاسم والفئات قبل الربط. لن ننشئ نموذجًا آخر. انتظر دقيقتين إذا كان الطلب ما زال جاريًا.',
                'Inspect the Flow in Meta or sync the Flow list, then enter its confirmed ID. Account, name and categories are verified before linking. This does not create another Flow. Wait two minutes if the request is still running.',
              )}
            </p>
            <label className="field">
              {t('معرّف النموذج المؤكد لدى Meta', 'Confirmed Meta Flow ID')}
              <input
                dir="ltr"
                inputMode="numeric"
                value={receipt}
                onChange={(e) => setReceipt(e.target.value)}
              />
            </label>
            <Button
              busy={busy}
              disabled={!/^\d+$/.test(receipt)}
              onClick={() =>
                void run(
                  () =>
                    api(`${path}/${reconciling.id}/reconcile`, {
                      method: 'POST',
                      body: JSON.stringify({ revision: reconciling.revision, providerId: receipt }),
                    }),
                  () => {
                    setReconciling(null);
                    setNotice(
                      t(
                        'تم ربط دليل التسجيل. ارفع التعريف الحالي وافحصه قبل النشر.',
                        'Registration receipt linked. Upload and validate the current definition before publishing.',
                      ),
                    );
                  },
                )
              }
            >
              {t('تحقق واربط النموذج', 'Verify & Link Flow')}
            </Button>
          </div>
        )}
      </Dialog>
      <Dialog
        open={!!preview}
        onClose={() => setPreview(null)}
        title={t('معاينة Meta', 'Meta Preview')}
      >
        {preview && (
          <div className="stack">
            <strong>{preview.name}</strong>
            <a className="btn btn-primary" href={preview.url} target="_blank" rel="noreferrer">
              {t('فتح المعاينة', 'Open Preview')}
            </a>
            <p>
              {t('انتهاء الرابط', 'Link Expires')}: {preview.expiresAt}
            </p>
            <p className="muted">
              {t(
                'بعد نشر النموذج يمكنك اختياره في عقدة WhatsApp Flow داخل محرر المحادثة.',
                'After publishing, select the Flow in a WhatsApp Flow node in the conversation editor.',
              )}
            </p>
          </div>
        )}
      </Dialog>
    </section>
  );
}
