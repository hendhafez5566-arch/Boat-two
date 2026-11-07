'use client';
import { useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { useData } from '../../../components/business/useData';
import { TemplateDraftForm, TemplateRow } from '../../../components/business/TemplateDraftForm';
import { useLocale } from '../../../components/product/locale';
import { Dialog } from '../../../components/product/ProductUI';
import { NavIcon } from '../../../components/product/NavIcon';
import { managerError } from './manager-feedback';
import styles from './manager.module.css';

type Template = TemplateRow & { updated_at?: string };
export default function ManagerTemplates({ channelId }: { channelId: string }) {
  const { t, language } = useLocale();
  const path = `/channels/${channelId}/templates`;
  const list = useData<Template[]>(path, []);
  const [tab, setTab] = useState('templates');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{
    key: 'name' | 'id' | 'category' | 'status' | 'updated_at';
    ascending: boolean;
  }>({ key: 'updated_at', ascending: false });
  const [page, setPage] = useState(1),
    [size, setSize] = useState(10);
  const [editing, setEditing] = useState<Template | null | undefined>();
  const [view, setView] = useState<Template | null>(null);
  const [submitting, setSubmitting] = useState<Template | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  const lock = useRef(false);
  async function act(url: string, body?: unknown, method = 'POST') {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await api(url, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      await list.reload();
      setSaved(true);
      return true;
    } catch (e) {
      setError(managerError(e, t));
      return false;
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  const label = (status: string) =>
    ({
      DRAFT: t('مسودة', 'Draft'),
      PENDING: t('قيد المراجعة', 'Pending'),
      APPROVED: t('معتمد', 'Approved'),
      REJECTED: t('مرفوض', 'Rejected'),
      SUBMITTING: t('جارٍ التقديم', 'Submitting'),
      SUBMISSION_UNKNOWN: t('تحتاج المزامنة', 'Sync required'),
    })[status] || status;
  const sorted = list.data
    .filter((x) =>
      `${x.name} ${x.category} ${x.status}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
    )
    .sort(
      (a, b) =>
        (sort.ascending ? 1 : -1) *
        String(a[sort.key] || '').localeCompare(String(b[sort.key] || ''), language, {
          numeric: true,
        }),
    );
  const pages = Math.max(1, Math.ceil(sorted.length / size)),
    current = Math.min(page, pages),
    rows = sorted.slice((current - 1) * size, current * size);
  const variables = list.data
    .flatMap((template) =>
      [...new Set([...template.body.matchAll(/\{\{(\d+)\}\}/g)].map((x) => x[1]))].map(
        (position) => ({
          template,
          position,
          example: template.examples[Number(position) - 1] || '—',
        }),
      ),
    )
    .filter((v) =>
      `${v.template.name} ${v.position} ${v.example}`.toLowerCase().includes(search.toLowerCase()),
    );
  const sortBy = (key: typeof sort.key) => {
    setSort({ key, ascending: sort.key === key ? !sort.ascending : true });
    setPage(1);
  };
  const close = () => {
    if (!busy) setEditing(undefined);
  };
  return (
    <section className={styles.templateManager}>
      <header className={styles.contentHeader}>
        <div>
          <h2>{t('قوالب الرسائل', 'Message Templates')}</h2>
          <p>
            {t(
              'إنشاء ومزامنة وإدارة قوالب WhatsApp ومتغيراتها.',
              'Create, sync, and manage WhatsApp message templates and template variables.',
            )}
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void act(path + '/sync')}
          >
            <NavIcon name="refresh" />
            {t('مزامنة القوالب', 'Sync Templates')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => {
              setError('');
              setEditing(null);
            }}
          >
            + {t('إنشاء', 'Create')}
          </button>
        </div>
      </header>
      <div
        className={styles.templateTabs}
        role="tablist"
        aria-label={t('أقسام القوالب', 'Message Template Sections')}
      >
        {['templates', 'variables'].map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={tab === value}
            onClick={() => {
              setTab(value);
              setSearch('');
              setPage(1);
            }}
          >
            {value === 'templates' ? t('القوالب', 'Templates') : t('المتغيرات', 'Variables')}
          </button>
        ))}
      </div>
      {(error || list.error) && (
        <p role="alert" className="notice error">
          {error || list.error}
        </p>
      )}
      {saved && (
        <p className={styles.feedback} role="status">
          {t('حُفظ التغيير.', 'Change saved.')}
        </p>
      )}
      <label className={styles.templateSearch}>
        <span className={styles.srOnly}>
          {t('بحث القوالب والمتغيرات', 'Search templates and variables')}
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder={t('بحث…', 'Search…')}
        />
        <NavIcon name="search" />
      </label>
      {tab === 'templates' ? (
        <>
          <div className={styles.tableScroll}>
            <table className={`${styles.table} ${styles.templateTable}`} aria-busy={list.loading}>
              <thead>
                <tr>
                  <th>#</th>
                  {[
                    ['id', t('المعرّف', 'ID')],
                    ['name', t('اسم القالب', 'Template Name')],
                    ['category', t('التصنيف', 'Category')],
                  ].map(([key, title]) => (
                    <th
                      key={key}
                      scope="col"
                      aria-sort={
                        sort.key === key ? (sort.ascending ? 'ascending' : 'descending') : 'none'
                      }
                    >
                      <button type="button" onClick={() => sortBy(key as typeof sort.key)}>
                        {title}
                        <NavIcon name="sort" />
                      </button>
                    </th>
                  ))}
                  <th>{t('النوع', 'Type')}</th>
                  <th
                    scope="col"
                    aria-sort={
                      sort.key === 'status' ? (sort.ascending ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    <button type="button" onClick={() => sortBy('status')}>
                      {t('الحالة', 'Status')}
                      <NavIcon name="sort" />
                    </button>
                  </th>
                  <th>{t('الإجراءات', 'Actions')}</th>
                  <th>
                    <button type="button" onClick={() => sortBy('updated_at')}>
                      {t('آخر تعديل', 'Updated At')}
                      <NavIcon name="sort" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x, index) => (
                  <tr key={x.id}>
                    <td data-label="#">{(current - 1) * size + index + 1}</td>
                    <td data-label={t('المعرّف', 'ID')} title={x.id}>
                      <span className={styles.uniqueId}>{x.id}</span>
                    </td>
                    <td data-label={t('اسم القالب', 'Template Name')}>{x.name}</td>
                    <td data-label={t('التصنيف', 'Category')}>{x.category}</td>
                    <td data-label={t('النوع', 'Type')}>
                      {x.components.find((c) => c.type === 'HEADER')?.format || 'text'}
                    </td>
                    <td data-label={t('الحالة', 'Status')}>
                      <span className={styles.templateStatus} data-status={x.status}>
                        {label(x.status)}
                      </span>
                      {x.error && (
                        <small className={styles.flowDetail}>
                          {t(
                            'زامن النتيجة قبل أي محاولة أخرى.',
                            'Sync the outcome before retrying.',
                          )}
                        </small>
                      )}
                      {x.supported === false && (
                        <small className={styles.flowDetail}>
                          {t(
                            'هذا النوع يحتاج دعمًا إضافيًا قبل الإرسال.',
                            'Additional component support is required before sending.',
                          )}
                        </small>
                      )}
                    </td>
                    <td data-label={t('الإجراءات', 'Actions')}>
                      <div className={styles.actions}>
                        <button
                          className="btn"
                          type="button"
                          aria-label={`${t('عرض', 'View')}: ${x.name}`}
                          title={t('عرض', 'View')}
                          onClick={() => setView(x)}
                        >
                          <NavIcon name="eye" />
                        </button>
                        {x.status === 'DRAFT' && (
                          <>
                            <button
                              className="btn"
                              type="button"
                              disabled={busy}
                              aria-label={`${t('تعديل المسودة', 'Edit draft')}: ${x.name}`}
                              title={t('تعديل المسودة', 'Edit draft')}
                              onClick={() => {
                                setError('');
                                setEditing(x);
                              }}
                            >
                              <NavIcon name="edit" />
                            </button>
                            <button
                              className="btn"
                              type="button"
                              disabled={busy}
                              aria-label={`${t('تقديم للمراجعة', 'Submit for approval')}: ${x.name}`}
                              title={t('تقديم للمراجعة', 'Submit for approval')}
                              onClick={() => {
                                setError('');
                                setSubmitting(x);
                              }}
                            >
                              <NavIcon name="export" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                    <td data-label={t('آخر تعديل', 'Updated At')}>
                      {x.updated_at ? (
                        <time dateTime={x.updated_at}>
                          {new Date(x.updated_at).toLocaleDateString(
                            language === 'ar' ? 'ar-EG' : 'en-GB',
                          )}
                        </time>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={8} className={styles.empty}>
                      {list.loading
                        ? t('جارٍ تحميل القوالب…', 'Loading templates…')
                        : t(
                            'لا توجد قوالب مطابقة. أنشئ مسودة أو غيّر البحث.',
                            'No matching templates. Create a draft or change the search.',
                          )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <footer className={styles.pagination}>
            <label>
              <span className={styles.srOnly}>{t('الصفوف', 'Rows')}</span>
              <select
                value={size}
                onChange={(e) => {
                  setSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <span>
              {sorted.length ? (current - 1) * size + 1 : 0}–
              {Math.min(current * size, sorted.length)} / {sorted.length}
            </span>
            <div>
              <button
                className="btn"
                type="button"
                disabled={current === 1}
                onClick={() => setPage(current - 1)}
              >
                {t('السابق', 'Previous')}
              </button>
              <span>{current}</span>
              <button
                className="btn"
                type="button"
                disabled={current === pages}
                onClick={() => setPage(current + 1)}
              >
                {t('التالي', 'Next')}
              </button>
            </div>
          </footer>
        </>
      ) : (
        <>
          <p className={styles.actionHint}>
            {t(
              'متغيرات نص القوالب وقيم المعاينة المحفوظة. تُعدّل الأمثلة من مسودة القالب.',
              'Template body variables and saved preview values. Edit examples in the template draft.',
            )}
          </p>
          <div className={styles.tableScroll}>
            <table className={`${styles.table} ${styles.templateTable}`}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('القالب', 'Template')}</th>
                  <th>{t('المتغير', 'Variable')}</th>
                  <th>{t('مثال محفوظ', 'Saved example')}</th>
                  <th>{t('الإجراءات', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {variables.map((v, i) => (
                  <tr key={v.template.id + v.position}>
                    <td data-label="#">{i + 1}</td>
                    <td data-label={t('القالب', 'Template')}>{v.template.name}</td>
                    <td data-label={t('المتغير', 'Variable')}>
                      <code>{`{{${v.position}}}`}</code>
                    </td>
                    <td data-label={t('مثال محفوظ', 'Saved example')}>{v.example}</td>
                    <td data-label={t('الإجراءات', 'Actions')}>
                      <button className="btn" type="button" onClick={() => setView(v.template)}>
                        {t('عرض القالب', 'View template')}
                      </button>
                    </td>
                  </tr>
                ))}
                {!variables.length && (
                  <tr>
                    <td colSpan={5} className={styles.empty}>
                      {t('لا توجد متغيرات مطابقة.', 'No matching variables.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Dialog
        className={`${styles.managerDialog} ${styles.templateDialog}`}
        open={editing !== undefined}
        onClose={close}
        title={
          editing
            ? t('تعديل مسودة القالب', 'Edit Template Draft')
            : t('إنشاء قالب رسالة', 'Create Message Template')
        }
      >
        {editing !== undefined && (
          <>
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
            <TemplateDraftForm
              key={editing ? editing.id + ':' + editing.revision : 'new'}
              initial={editing || undefined}
              busy={busy}
              cancel={close}
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
          </>
        )}
      </Dialog>
      <Dialog
        className={styles.managerDialog}
        open={!!view}
        onClose={() => setView(null)}
        title={t('معاينة القالب', 'Template Preview')}
      >
        {view && (
          <div className={styles.form}>
            <h3>{view.name}</h3>
            <p>
              {view.language} · {view.category} · {label(view.status)}
            </p>
            {view.components
              .filter((c) => c.type === 'HEADER')
              .map((c, i) => (
                <strong key={i}>
                  {c.text || `${t('ترويسة وسائط', 'Media header')}: ${c.format}`}
                </strong>
              ))}
            <p className={styles.templateBody}>{view.body}</p>
            {view.components
              .filter((c) => c.type === 'FOOTER')
              .map((c, i) => (
                <small key={i}>{c.text}</small>
              ))}
            {view.components
              .find((c) => c.type === 'BUTTONS')
              ?.buttons?.map((b, i) => (
                <span className={styles.previewButton} key={i}>
                  {b.text}
                </span>
              ))}
            <div className={styles.dialogFooter}>
              <button className="btn" type="button" onClick={() => setView(null)}>
                {t('إغلاق', 'Close')}
              </button>
            </div>
          </div>
        )}
      </Dialog>
      <Dialog
        className={styles.managerDialog}
        open={!!submitting}
        onClose={() => {
          if (!busy) setSubmitting(null);
        }}
        title={t('تقديم القالب للمراجعة', 'Submit Template for Approval')}
      >
        {submitting && (
          <div className={styles.form}>
            <p>
              {t(
                'تقديم هذا القالب إلى Meta للموافقة؟ لن يرسل ذلك رسالة إلى العملاء.',
                'Submit this template to Meta for approval? This does not send a message to customers.',
              )}{' '}
              <strong>{submitting.name}</strong>
            </p>
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
            <div className={styles.dialogFooter}>
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => setSubmitting(null)}
              >
                {t('إلغاء', 'Cancel')}
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy}
                onClick={() =>
                  void act(path + '/' + submitting.id + '/submit').then((ok) => {
                    if (ok) setSubmitting(null);
                  })
                }
              >
                {busy
                  ? t('جارٍ التقديم…', 'Submitting…')
                  : t('تأكيد التقديم', 'Confirm submission')}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </section>
  );
}
