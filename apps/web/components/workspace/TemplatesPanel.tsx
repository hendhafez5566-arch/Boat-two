'use client';
import { useTransientNotice } from '../product/useTransientNotice';
import { NavIcon } from '../product/NavIcon';
import { useRef, useState } from 'react';
import { Dialog } from '../product/ProductUI';
import Link from 'next/link';
import styles from './whatsapp-templates.module.css';
import ChannelLogo from '../product/ChannelLogo';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { TemplateDraftForm, TemplateRow } from '../business/TemplateDraftForm';
import { useData } from '../business/useData';
export default function Templates({
  params,
  embedded,
}: {
  params: { id: string };
  embedded?: boolean;
}) {
  const { t, language } = useLocale();
  const path = `/channels/${params.id}/templates`;
  const data = useData<TemplateRow[]>(path, []);
  const availability = useData<{ state: string; mediaUpload?: boolean } | null>(
    path + '/availability',
    null,
  );
  const state = availability.data?.state;
  const metaBlocked = state !== 'ready';
  const [page, setPage] = useState(1);
  const [syncCount, setSyncCount] = useState<{
    synced?: number;
    skippedDrafts?: number;
    moreAvailable?: boolean;
  }>({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [order, setOrder] = useState('recent');
  const [categoryFilter,setCategoryFilter]=useState('all');
  const [copy, setCopy] = useState<TemplateRow>();
  const [confirmation, setConfirmation] = useState<{
    row: TemplateRow;
    action: 'submit' | 'archive';
  }>();
  const lock = useRef(false);
  const label = (value: string) =>
    (
      ({
        DRAFT: t('مسودة', 'Draft'),
        PENDING: t('قيد المراجعة', 'Pending review'),
        APPROVED: t('معتمد', 'Approved'),
        REJECTED: t('مرفوض', 'Rejected'),
        ARCHIVED: t('في سلة المسودات', 'In draft trash'),
        SUBMITTING: t('جارٍ التقديم', 'Submitting'),
        SUBMISSION_UNKNOWN: t('تحتاج مزامنة', 'Sync required'),
      }) as Record<string, string>
    )[value] || value;
  const visible = data.data.filter(
    (row) =>
      (filter === 'all' ? row.status !== 'ARCHIVED' : row.status === filter) && (categoryFilter==='all'||row.category===categoryFilter) &&
      [row.name, row.body, row.language, row.category, label(row.status), ...row.examples]
        .join(' ')
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  if (order === 'name') visible.sort((a, b) => a.name.localeCompare(b.name, language));
  const pages = Math.max(1, Math.ceil(visible.length / 12));
  const currentPage = Math.min(page, pages);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | undefined>();
  const [saved, setSaved] = useState<'draft' | 'sync' | 'submit' | 'archive' | 'restore' | null>(
    null,
  );
  useTransientNotice(saved==='sync'&&(syncCount.skippedDrafts||syncCount.moreAvailable)?null:saved,()=>setSaved(null));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function act(
    url: string,
    body?: unknown,
    method = 'POST',
    action: 'draft' | 'sync' | 'submit' | 'archive' | 'restore' = 'draft',
    onSuccess?: (row: TemplateRow) => void,
  ) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError('');
    setSaved(null);
    try {
      const result = await api<
        TemplateRow & { synced?: number; skippedDrafts?: number; moreAvailable?: boolean }
      >(url, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      await data.reload();
      setSaved(action);
      if (action === 'sync') setSyncCount(result);
      onSuccess?.(result);
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
      lock.current = false;
      setBusy(false);
    }
  }
  function closeEditor() {
    setCreating(false);
    setEditing(undefined);
    setCopy(undefined);
    setError('');
  }
  function saveDraft(draft: unknown, review = false) {
    return act(
      editing ? path + '/' + editing.id : path,
      editing ? { revision: editing.revision, draft } : draft,
      editing ? 'PATCH' : 'POST',
      'draft',
      (row) => {
        closeEditor();
        if (review) setConfirmation({ row, action: 'submit' });
      },
    );
  }
  if (creating || editing || copy) {
    return (
      <section className={styles.editor}>
        <button type="button" className={styles.back} disabled={busy} onClick={()=>{if(confirm(t('العودة دون حفظ التعديلات؟','Return without saving changes?')))closeEditor();}}>
          <NavIcon name="chevron"/>{t('العودة إلى القوالب', 'Back to templates')}
        </button>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <TemplateDraftForm
          key={editing ? editing.id + ':' + editing.revision : copy ? 'copy:' + copy.id : 'new'}
          initial={editing || copy}
          busy={busy}
          cancel={()=>{if(confirm(t('إلغاء التعديلات غير المحفوظة؟','Discard unsaved changes?')))closeEditor();}}
          uploadMedia={
            availability.data?.mediaUpload
              ? async (file, format) => {
                  const form = new FormData();
                  form.set('file', file);
                  const result = await api<{ h: string }>(
                    path + '/media?format=' + encodeURIComponent(format),
                    { method: 'POST', body: form },
                  );
                  return result.h;
                }
              : undefined
          }
          save={saveDraft}
          saveAndReview={metaBlocked ? undefined : (draft) => saveDraft(draft, true)}
        />
      </section>
    );
  }
  return (
    <section className={styles.page}>
      {!embedded && (
        <Link className={styles.back} href={'/dashboard/channels?manage=' + params.id}>
          <NavIcon name="chevron"/>{t('العودة إلى قنوات الاتصال', 'Back to channels')}
        </Link>
      )}
      <header className={styles.heading}>
        <div className={styles.title}>
          <span aria-hidden="true">
            <ChannelLogo id="whatsapp" />
          </span>
          <div>
            <h1>{t('قوالب واتساب', 'WhatsApp templates')}</h1>
            <p>
              {t(
                'جهّز رسائل متكررة مثل تأكيد الحجز. راجع حالة موافقة Meta قبل استخدام القالب.',
                'Prepare messages such as booking confirmations. Check Meta approval before using a template.',
              )}
            </p>
          </div>
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
            <NavIcon name="plus"/>{t('قالب جديد', 'New template')}
          </button>
          <button
            className="btn"
            disabled={busy || metaBlocked}
            onClick={() => void act(path + '/sync', undefined, 'POST', 'sync')}
          >
            <NavIcon name="refresh"/>{t('مزامنة من Meta', 'Sync from Meta')}
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
          <Link className="btn" href="/dashboard/channels/connect/whatsapp">
            {t('إدارة اتصال واتساب', 'Manage WhatsApp connection')}
          </Link>
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
            ? t(
                `تمت مزامنة ${syncCount.synced ?? 0} قالب.`,
                `Synced ${syncCount.synced ?? 0} templates.`,
              )
            : saved === 'submit'
              ? t('تم تقديم القالب للمراجعة.', 'Template submitted for review.')
              : saved === 'archive'
                ? t('نُقلت المسودة إلى السلة.', 'Draft moved to trash.')
                : saved === 'restore'
                  ? t('تمت استعادة المسودة.', 'Draft restored.')
                  : t('تم حفظ المسودة.', 'Draft saved.')}
        </p>
      )}
      {saved === 'sync' && !!syncCount.skippedDrafts && (
        <p role="status">
          {t(
            'تُركت المسودات المحلية اللي لها نفس أسماء قوالب Meta من غير تعديل.',
            'Local drafts matching Meta template names were preserved.',
          )}
        </p>
      )}
      {saved === 'sync' && syncCount.moreAvailable && (
        <p role="status">
          {t('وصلت المزامنة للحد الأقصى من الصفحات.', 'The sync reached its page limit.')}
        </p>
      )}
      {data.loading && <p role="status">{t('جارٍ تحميل القوالب…', 'Loading templates…')}</p>}
      {(error || data.error) && (
        <p className="notice error" role="alert">
          {error || data.error}
        </p>
      )}
      <div className={styles.metrics}>{([['all','grid',t('كل القوالب','All templates')],['APPROVED','circleCheck',t('معتمدة','Approved')],['DRAFT','edit',t('مسودات','Drafts')],['PENDING','stopwatch',t('قيد المراجعة','Pending')],['REJECTED','circleClose',t('مرفوضة','Rejected')],['ARCHIVED','trash',t('السلة','Trash')]] as const).map(([key,icon,label])=><button type="button" key={key} data-status={key} aria-pressed={filter===key} onClick={()=>{setFilter(key);setPage(1)}}><NavIcon name={icon}/><span><small>{label}</small><strong>{data.loading||data.error?'—':data.data.filter(row=>key==='all'?row.status!=='ARCHIVED':row.status===key).length}</strong></span></button>)}</div>
      <div className={styles.filters}>
        <label className="field">
          {t('بحث القوالب', 'Search templates')}
          <input placeholder={t('الاسم أو محتوى الرسالة…','Name or message content…')}
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="field">
          {t('الحالة', 'Status')}
          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">{t('كل القوالب', 'All templates')}</option>
            {[
              'DRAFT',
              'PENDING',
              'APPROVED',
              'REJECTED',
              'SUBMITTING',
              'SUBMISSION_UNKNOWN',
              'ARCHIVED',
            ].map((value) => (
              <option value={value} key={value}>
                {label(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">{t('التصنيف','Category')}<select value={categoryFilter} onChange={e=>{setCategoryFilter(e.target.value);setPage(1)}}><option value="all">{t('كل التصنيفات','All categories')}</option><option value="UTILITY">{t('خدمي','Utility')}</option><option value="MARKETING">{t('تسويقي','Marketing')}</option><option value="AUTHENTICATION">{t('مصادقة','Authentication')}</option></select></label>
        <label className="field">
          {t('الترتيب', 'Sort')}
          <select
            value={order}
            onChange={(event) => {
              setOrder(event.target.value);
              setPage(1);
            }}
          >
            <option value="recent">{t('الأحدث أولًا', 'Newest first')}</option>
            <option value="name">{t('حسب الاسم', 'By name')}</option>
          </select>
        </label>
      </div>
      <div className={styles.list}>
        {visible.slice((currentPage - 1) * 12, currentPage * 12).map((x) => (
          <section className={styles.template} key={x.id}>
            <div className={styles.cardHeading}><h2><bdi>{x.name}</bdi></h2><span className={styles.state} data-status={x.status}><NavIcon name={x.status==='APPROVED'?'circleCheck':x.status==='REJECTED'?'circleClose':x.status==='DRAFT'?'edit':'stopwatch'}/>{label(x.status)}</span></div>
            {x.error && x.status !== 'REJECTED' && (
              <p className="notice" role="status">
                {t(
                  'تحتاج نتيجة التقديم إلى المزامنة قبل أي محاولة أخرى.',
                  'Synchronize the submission outcome before any further attempt.',
                )}
              </p>
            )}
            {x.status === 'REJECTED' && x.error && <p role="status">{x.error}</p>}
            {!x.supported && (
              <p className="notice">
                {t(
                  'نوع القالب يحتاج دعم مكونات إضافية قبل إرساله.',
                  'This variant needs additional component support before it can be sent.',
                )}
              </p>
            )}
             <p className={styles.metadata}>
              {x.language === 'ar' ? t('العربية', 'Arabic') : x.language} ·{' '}
              {x.category === 'UTILITY'
                ? t('خدمي', 'Utility')
                : x.category === 'MARKETING'
                  ? t('تسويقي', 'Marketing')
                  : x.category}
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
            <p dir="auto" className={styles.message}>{x.body.replace(/\{\{(\d+)\}\}/g,(token,index)=>x.examples[Number(index)-1]||token)}</p>
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
            {x.examples.length > 0 && (
              <details>
                <summary>{t('أمثلة المتغيرات', 'Variable examples')}</summary>
                <ol>
                  {x.examples.map((example, index) => (
                    <li key={index}>
                      <bdi>{example}</bdi>
                    </li>
                  ))}
                </ol>
              </details>
            )}
            <div className={styles.cardActions}>{x.supported &&
              x.status !== 'ARCHIVED' &&
              ['UTILITY', 'MARKETING'].includes(x.category) && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => {
                    setSaved(null);
                    setError('');
                    setCopy({
                      ...x,
                      name: x.name.slice(0, 507) + '_copy',
                      examples: x.examples.length
                        ? x.examples
                        : x.components.find((c) => c.type === 'BODY')?.example?.body_text?.[0] ||
                          [],
                    });
                  }}
                >
                  <NavIcon name="copy"/>{t('نسخ إلى مسودة', 'Copy to draft')}
                </button>
              )}
            {x.status === 'DRAFT' && (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => {
                  setError('');
                  setConfirmation({ row: x, action: 'archive' });
                }}
              >
                <NavIcon name="trash"/>{t('نقل إلى السلة', 'Move to trash')}
              </button>
            )}
            {x.status === 'ARCHIVED' && (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() =>
                  void act(
                    path + '/' + x.id + '/restore',
                    { revision: x.revision },
                    'POST',
                    'restore',
                  )
                }
              >
                <NavIcon name="undo"/>{t('استعادة المسودة', 'Restore draft')}
              </button>
            )}
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
                <NavIcon name="edit"/>{t('تعديل المسودة', 'Edit draft')}
              </button>
            )}
            {x.status === 'DRAFT' && (
              <button
                className="btn"
                disabled={busy || metaBlocked}
                onClick={() => {
                  setError('');
                  setConfirmation({ row: x, action: 'submit' });
                }}
              >
                <NavIcon name="delivery"/>{t('تقديم للموافقة لدى Meta', 'Submit for Meta approval')}
              </button>
            )}
            </div></section>
        ))}
      </div>
      {!data.loading && !data.error && !visible.length && !creating && (
        <div className={styles.empty}>
          <h2>{t('لا توجد قوالب مطابقة', 'No matching templates')}</h2>
        </div>
      )}
      {pages > 1 && (
        <nav className={styles.actions} aria-label={t('صفحات القوالب', 'Template pages')}>
          <button
            className="btn"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            {t('السابق', 'Previous')}
          </button>
          <span>
            {currentPage} / {pages}
          </span>
          <button
            className="btn"
            disabled={currentPage === pages}
            onClick={() => setPage(currentPage + 1)}
          >
            {t('التالي', 'Next')}
          </button>
        </nav>
      )}
      <Dialog
        open={!!confirmation}
        onClose={() => {
          if (!busy) setConfirmation(undefined);
        }}
        title={
          confirmation?.action === 'submit'
            ? t('تأكيد تقديم القالب إلى Meta', 'Confirm submission to Meta')
            : t('نقل المسودة إلى السلة', 'Move draft to trash')
        }
      >
        {confirmation && (
          <>
            <p>
              <bdi>{confirmation.row.name}</bdi>
            </p>
            <p>
              {confirmation.action === 'submit'
                ? t(
                    'سيُرسل محتوى القالب إلى Meta للمراجعة. الإجراء لا يرسل رسالة إلى العملاء.',
                    'The template content will be sent to Meta for review. This does not send a message to customers.',
                  )
                : t(
                    'تقدر تستعيد المسودة من فلتر «في سلة المسودات».',
                    'Restore the draft from the draft trash filter.',
                  )}
            </p>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <div className={styles.actions}>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => setConfirmation(undefined)}
              >
                {t('إلغاء', 'Cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => {
                  const { action, row } = confirmation;
                  void act(
                    path + '/' + row.id + '/' + action,
                    action === 'archive' ? { revision: row.revision } : undefined,
                    'POST',
                    action,
                    () => setConfirmation(undefined),
                  );
                }}
              >
                {confirmation.action === 'submit'
                  ? t('تأكيد التقديم', 'Confirm submission')
                  : t('تأكيد النقل', 'Confirm move')}
              </button>
            </div>
          </>
        )}
      </Dialog>
    </section>
  );
}
