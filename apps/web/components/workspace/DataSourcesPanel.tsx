'use client';
import { NavIcon } from '../product/NavIcon';
import styles from './commerce-wizard.module.css';
import ImportSummary, { ImportCounts } from './ImportSummary';
import { DisclosureSummary } from '../product/DisclosureSummary';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { catalogError } from '../../lib/catalog-error';
import { useLocale } from '../product/locale';
import { suggestCatalogMapping, type CatalogMapping as Mapping } from '../../lib/catalog-mapping';
type Source = {
  id: string;
  name: string;
  kind: 'file' | 'google';
  connection_id?: string;
  spreadsheet_id?: string;
  sheet_range?: string;
  mapping: Mapping;
  auto_sync: boolean;
  ai_enabled: boolean;
  last_success_at?: string;
  last_error?: string;
};
type Item = {
  name: string;
  description: string;
  category?: string;
  category_path?: string;
  visible?: boolean;
  fields?: { label: string; value: string }[];
  dynamic_fields?: { label: string; value: string }[];
};
type Preview = {
  valid: boolean;
  summary?: ImportCounts;
  previewId?: string;
  items: Item[];
  total: number;
  hidden?: number;
  missing: number;
  errors: { row: number; message: string }[];
};
const mappingKey = (m: Mapping) =>
  JSON.stringify([
    m.id,
    m.name,
    m.description,
    m.category,
    m.visible,
    m.order,
    m.categoryOrder,
    m.image,
    m.link,
    m.fields.map((f) => [f.column, f.label, f.kind]),
  ]);
const blank: Mapping = { id: '', name: '', fields: [] };
export default function DataSourcesPanel({
  onApplied,
  onDraftStateChange,
}: {
  onApplied?: (sourceId: string) => void;
  onDraftStateChange?: (state: { dirty: boolean; busy: boolean }) => void;
} = {}) {
  const { t, language } = useLocale();
  const [step, setStep] = useState(0);
  const [appliedCount, setAppliedCount] = useState(0);
  const [appliedSummary, setAppliedSummary] = useState<ImportCounts | null>(null);
  const [sources, setSources] = useState<Source[]>([]),
    [editing, setEditing] = useState<Source | null>(null),
    [name, setName] = useState(''),
    [kind, setKind] = useState<'file' | 'google'>('file'),
    [mapping, setMapping] = useState<Mapping>(blank),
    [headers, setHeaders] = useState<string[]>([]),
    [sample, setSample] = useState<string[][]>([]),
    [file, setFile] = useState<File | null>(null),
    [sheets, setSheets] = useState<string[]>([]),
    [sheet, setSheet] = useState(''),
    [connections, setConnections] = useState<{ id: string; name: string; provider: string }[]>([]),
    [connection, setConnection] = useState(''),
    [files, setFiles] = useState<{ id: string; name: string }[]>([]),
    [spreadsheet, setSpreadsheet] = useState(''),
    [auto, setAuto] = useState(false),
    [ai, setAi] = useState(false),
    [preview, setPreview] = useState<Preview | null>(null),
    [archive, setArchive] = useState(false),
    [visibilityConfirmed, setVisibilityConfirmed] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [items, setItems] = useState<Item[]>([]),
    [page, setPage] = useState(0),
    [total, setTotal] = useState(0),
    [category, setCategory] = useState(''),
    [categories, setCategories] = useState<{ name: string; count: number }[]>([]),
    [query, setQuery] = useState(''),
    [runs, setRuns] = useState<
      { status: string; item_count: number; error?: string; created_at: string; summary?: Partial<ImportCounts> }[]
    >([]);
  const dirty =
    !!editing &&
    (name !== editing.name ||
      kind !== editing.kind ||
      mappingKey(mapping) !== mappingKey(editing.mapping) ||
      auto !== editing.auto_sync ||
      ai !== editing.ai_enabled ||
      (kind === 'google' &&
        (connection !== editing.connection_id ||
          spreadsheet !== editing.spreadsheet_id ||
          sheet !== editing.sheet_range)));
  const unsaved = dirty || !!file || (!editing && !!(name || headers.length || spreadsheet));
  useEffect(() => {
    onDraftStateChange?.({ dirty: unsaved, busy });
  }, [unsaved, busy, onDraftStateChange]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (unsaved || busy) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [unsaved, busy]);
  useEffect(() => {
    setPreview(null);
  }, [mapping, name, kind, connection, spreadsheet, sheet, auto, ai]);
  const refresh = async () => setSources(await api<Source[]>('/commerce/sources'));
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    api<typeof connections>('/integrations')
      .then(setConnections)
      .catch(() => {});
  }, []);
  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(catalogError((e as Error).message, language));
    } finally {
      setBusy(false);
    }
  }
  function select(s: Source | null) {
    if (busy) return;
    if (
      unsaved &&
      !window.confirm(
        t(
          'توجد بيانات مصدر لم تُطبق. هل تريد تجاهلها؟',
          'There are unapplied source changes. Discard them?',
        ),
      )
    )
      return;
    setStep(0);
    setEditing(s);
    setName(s?.name ?? '');
    setKind(s?.kind ?? 'file');
    setMapping(s?.mapping ?? blank);
    setHeaders(
      s
        ? [
            ...new Set(
              [
                s.mapping.id,
                s.mapping.name,
                s.mapping.description,
                s.mapping.category,
                s.mapping.visible,
                s.mapping.order,
                s.mapping.categoryOrder,
                s.mapping.image,
                s.mapping.link,
                ...s.mapping.fields.map((f) => f.column),
              ].filter(Boolean) as string[],
            ),
          ]
        : [],
    );
    setConnection(s?.connection_id ?? '');
    setSpreadsheet(s?.spreadsheet_id ?? '');
    setSheet(s?.sheet_range ?? '');
    setAuto(s?.auto_sync ?? false);
    setAi(s?.ai_enabled ?? false);
    setPreview(null);
    setAppliedSummary(null);
    setItems([]);
    setFile(null);
    setSample([]);
    setPage(0);
    setTotal(0);
    setQuery('');
    setError('');
    setCategory('');
    setCategories([]);
    setRuns([]);
    setSheets([]);
    setArchive(false);
  }
  async function upload(f: File, worksheet = '') {
    // A failed replacement must never leave an older preview available to apply.
    setPreview(null);
    setArchive(false);
    if (!worksheet) {
      setFile(null);
      setSheets([]);
      setSheet('');
    }
    setHeaders([]);
    setSample([]);
    const data = new FormData();
    data.set('file', f);
    if (worksheet) data.set('sheet', worksheet);
    const v = await api<{ sheets: string[]; rows: string[][] }>('/commerce/sources/file-preview', {
      method: 'POST',
      body: data,
    });
    setFile(f);
    setSheets(v.sheets);
    setSheet(worksheet || v.sheets[0]);
    setHeaders(v.rows[0] ?? []);
    if (!editing) {
      setMapping(suggestCatalogMapping(v.rows[0] ?? []));
      if (!name) setName(f.name.replace(/\.(xlsx|csv)$/i, ''));
    }
    setSample(v.rows.slice(1, 6));
    setPreview(null);
  }
  async function google(input: Record<string, unknown>) {
    return api<{ data: Record<string, unknown> }>(
      '/integrations/google/' + connection + '/execute',
      { method: 'POST', body: JSON.stringify({ input, dryRun: false, confirm: true }) },
    );
  }
  async function readSheet() {
    const r = await google({ operation: 'sheet_read', spreadsheetId: spreadsheet, range: sheet });
    const rows = (r.data.values ?? []) as string[][];
    setHeaders(rows[0] ?? []);
    if (!editing) setMapping(suggestCatalogMapping(rows[0] ?? []));
    setSample(rows.slice(1, 6));
    setPreview(null);
  }
  async function save() {
    const v = await api<Source>('/commerce/sources' + (editing ? '/' + editing.id : ''), {
      method: editing ? 'PATCH' : 'POST',
      body: JSON.stringify({
        name,
        kind,
        mapping,
        connectionId: kind === 'google' ? connection : undefined,
        spreadsheetId: kind === 'google' ? spreadsheet : undefined,
        range: kind === 'google' ? sheet : undefined,
        autoSync: kind === 'google' && auto,
        aiEnabled: ai,
      }),
    });
    setEditing(v);
    setPreview(null);
    await refresh();
    return v;
  }
  async function makePreview(source = editing) {
    if (!source) throw new Error(t('احفظ الربط أولًا', 'Save the source first'));
    let v: Preview;
    if (kind === 'file') {
      if (!file) throw new Error(t('ارفع النسخة الأحدث من الملف', 'Upload the latest file'));
      const data = new FormData();
      data.set('file', file);
      data.set('sheet', sheet);
      v = await api<Preview>('/commerce/sources/' + source.id + '/file-preview', {
        method: 'POST',
        body: data,
      });
    } else
      v = await api<Preview>('/commerce/sources/' + source.id + '/preview', {
        method: 'POST',
        body: '{}',
      });
    setPreview(v);
    setArchive(false);
    setVisibilityConfirmed(false);
  }
  async function browse(next = 0) {
    if (!editing) return;
    const p = new URLSearchParams({ page: String(next), category, query });
    const r = await api<{ items: Item[]; total: number }>(
      '/commerce/sources/' + editing.id + '/items?' + p,
    );
    setItems(r.items);
    setTotal(r.total);
    setPage(next);
    setCategories(await api('/commerce/sources/' + editing.id + '/categories'));
    setRuns(await api('/commerce/sources/' + editing.id + '/runs'));
  }
  const hiddenCount =
    preview?.hidden ?? preview?.items.filter((item) => item.visible === false).length ?? 0;
  const labels: [keyof Omit<Mapping, 'fields'>, string, string][] = [
    ['id', 'المعرف الثابت', 'Stable item key'],
    ['name', 'الاسم', 'Name'],
    ['description', 'الوصف', 'Description'],
    ['category', 'القسم (استخدم / لقسم فرعي)', 'Category (use / for subcategories)'],
    ['visible', 'ظاهر أو مخفي', 'Visible or hidden'],
    ['order', 'الترتيب', 'Order'],
    ['categoryOrder', 'ترتيب القسم', 'Category order'],
    ['image', 'رابط الصورة', 'Image link'],
    ['link', 'رابط التفاصيل', 'Details link'],
  ];
  const mapColumns = (columns: typeof labels) => (
    <div className="form-grid">
      {columns.map(([key, ar, en]) => (
        <label key={key}>
          {t(ar, en)}
          <select
            aria-label={t(ar, en)}
            value={mapping[key] ?? ''}
            onChange={(e) => {
              setMapping({ ...mapping, [key]: e.target.value || undefined });
              setPreview(null);
            }}
          >
            <option value="">{t('اختر عمودًا', 'Choose a column')}</option>
            {headers.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
          {mapping[key] && <small className={styles.hint}>
            {t('مثال من الملف:', 'File sample:')}{' '}
            {sample.slice(0, 2).map((row) => row[headers.indexOf(mapping[key] ?? '')] || '—').join(' · ')}
          </small>}
        </label>
      ))}
    </div>
  );
  return (
    <section
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      className={styles.root}
      style={{ minWidth: 0 }}
    >
      <header className={styles.importHeader}>
        <NavIcon name="upload"/>
        <h2>{t('الاستيراد والمزامنة', 'Import & sync')}</h2>
      </header>
      <ol className={styles.steps} aria-label={t('خطوات الاستيراد', 'Import steps')}>
        {[
          t('اختيار المصدر', 'Choose source'),
          t('مطابقة الأعمدة', 'Map columns'),
          t('المعاينة', 'Preview'),
          t('الاستيراد', 'Import'),
          t('النتيجة', 'Result'),
        ].map((label, i) => (
          <li key={i} aria-current={step === i ? 'step' : undefined} data-active={step === i}>
            <span>{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <p className={styles.hint}>
        {t(
          'خطوة واحدة في كل مرة. لن تتغير بيانات الكتالوج حتى تؤكد الاستيراد.',
          'One step at a time. Catalog items change only after you confirm the import.',
        )}
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className={styles.sourceToolbar}>
        <label>
          {t('المصدر', 'Source')}
          <select
            aria-label={t('المصدر', 'Source')}
            disabled={busy}
            value={editing?.id ?? ''}
            onChange={(e) => select(sources.find((s) => s.id === e.target.value) ?? null)}
          >
            <option value="">{t('مصدر جديد', 'New source')}</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" disabled={busy} onClick={() => select(null)}>
          {t('إضافة مصدر', 'Add source')}
        </button>
      </div>
      {editing && (
        <p role="status">
          {t('آخر مزامنة ناجحة: ', 'Last successful sync: ')}
          {editing.last_success_at
            ? new Date(editing.last_success_at).toLocaleString(language)
            : t('لم تتم بعد', 'Not yet')}
          {editing.last_error &&
            ' — ' +
              t(
                'تعذر التحديث؛ البيانات السليمة السابقة محفوظة',
                'Update failed; last successful data retained',
              )}
        </p>
      )}
      {step === 0 && (
        <>
          <div className="form-grid">
            <label>
              {t('اسم المصدر', 'Source name')}
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              {t('نوع المصدر', 'Source type')}
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as 'file' | 'google');
                  setPreview(null);
                }}
              >
                <option value="file">Excel / CSV</option>
                <option value="google">Google Sheets</option>
              </select>
            </label>
          </div>
          {kind === 'file' ? (
            <>
              <label className={styles.uploadZone}>
                <strong>{t('اختر ملف المنتجات', 'Choose your product file')}</strong>
                {t('رفع ملف .xlsx أو .csv — حتى 5 MB', 'Upload .xlsx or .csv — up to 5 MB')}
                <input
                  disabled={busy}
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    e.currentTarget.value = '';
                    if (f) void act(() => upload(f));
                  }}
                />
              </label>
              {sheets.length > 0 && (
                <label>
                  {t('ورقة العمل', 'Worksheet')}
                  <select
                    value={sheet}
                    disabled={busy}
                    onChange={(e) => {
                      if (file) void act(() => upload(file, e.target.value));
                    }}
                  >
                    {sheets.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              )}
            </>
          ) : (
            <>
              <button
                className="btn"
                disabled={busy}
                onClick={() => {
                  // Open before awaiting OAuth so popup blockers do not discard it;
                  // keep the editor and its unsaved draft in the original tab.
                  const authWindow = window.open('about:blank', '_blank');
                  if (!authWindow) {
                    setError(
                      t(
                        'اسمح بفتح نافذة الربط ثم حاول مجددًا',
                        'Allow the connection popup and try again',
                      ),
                    );
                    return;
                  }
                  authWindow.opener = null;
                  void act(async () => {
                    try {
                      const r = await api<{ authorizeUrl: string }>('/integrations/google/start', {
                        method: 'POST',
                        body: JSON.stringify({ purposes: ['sheets_read'] }),
                      });
                      authWindow.location.href = r.authorizeUrl;
                    } catch (e) {
                      authWindow.close();
                      throw e;
                    }
                  });
                }}
              >
                {t('ربط Google للقراءة فقط', 'Connect Google read only')}
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    setConnections(await api<typeof connections>('/integrations'));
                  })
                }
              >
                {t('تحديث الحسابات بعد الربط', 'Refresh accounts after connecting')}
              </button>
              <label>
                {t('حساب Google', 'Google account')}
                <select value={connection} onChange={(e) => setConnection(e.target.value)}>
                  <option value="">{t('اختر الحساب', 'Choose account')}</option>
                  {connections
                    .filter((c) => c.provider === 'google')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <button
                className="btn"
                disabled={busy || !connection}
                onClick={() =>
                  void act(async () => {
                    const r = await google({ operation: 'sheet_files' });
                    setFiles((r.data.files ?? []) as typeof files);
                  })
                }
              >
                {t('اختيار ملف من Google', 'Choose a Google file')}
              </button>
              {files.length > 0 && (
                <label>
                  {t('ملف Google Sheets', 'Google spreadsheet')}
                  <select
                    value={spreadsheet}
                    onChange={(e) => {
                      setSpreadsheet(e.target.value);
                      setSheets([]);
                      setSheet('');
                    }}
                  >
                    <option value="">{t('اختر الملف', 'Choose file')}</option>
                    {files.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                {t('أو الصق رابط الشيت الخاص', 'Or paste your private sheet link')}
                <input
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  onChange={(e) => {
                    const match = e.target.value.match(/\/spreadsheets\/d\/([\w-]+)/);
                    if (match) setSpreadsheet(match[1]);
                  }}
                />
              </label>
              <button
                className="btn"
                disabled={busy || !spreadsheet || !connection}
                onClick={() =>
                  void act(async () => {
                    const r = await google({
                      operation: 'sheet_metadata',
                      spreadsheetId: spreadsheet,
                    });
                    const names = (r.data.sheets as { properties: { title: string } }[]).map(
                      (s) => s.properties.title,
                    );
                    setSheets(names);
                    setSheet(names[0] ? "'" + names[0].replace(/'/g, "''") + "'" : '');
                  })
                }
              >
                {t('عرض أوراق العمل', 'Show worksheets')}
              </button>
              <label>
                {t('ورقة العمل أو النطاق', 'Worksheet or range')}
                <input
                  list="data-worksheets"
                  value={sheet}
                  onChange={(e) => setSheet(e.target.value)}
                />
                <datalist id="data-worksheets">
                  {sheets.map((s) => (
                    <option key={s} value={"'" + s.replace(/'/g, "''") + "'"} />
                  ))}
                </datalist>
              </label>
              <button className="btn" disabled={busy || !sheet} onClick={() => void act(readSheet)}>
                {t('معاينة الأعمدة', 'Preview columns')}
              </button>
              <label>
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                {t(
                  'مزامنة كل 15 دقيقة — لا تؤرشف الصفوف المفقودة تلقائيًا',
                  'Sync every 15 minutes — never auto archive missing rows',
                )}
              </label>
            </>
          )}
          <div className={styles.actions}>
            <button
              className="btn btn-primary"
              disabled={busy || !name.trim() || !headers.length}
              onClick={() => setStep(1)}
            >
              {t('التالي: مطابقة الأعمدة', 'Next: map columns')}
            </button>
          </div>
        </>
      )}
      {step === 1 && headers.length > 0 && (
        <>
          <h3>{t('راجع الأعمدة المقترحة', 'Review suggested columns')}</h3>
          <p>
            {t(
              'راجع المعرّف والاسم. الأعمدة الإضافية لا تظهر للعميل إلا باختيارك.',
              'Check the stable key and name. Extra columns are shown only when you select them.',
            )}
          </p>
          {mapColumns(labels.slice(0, 2))}
          <details className={styles.optionalMapping}>
            <DisclosureSummary>
              {t(
                'مطابقة اختيارية: الوصف والأقسام والصور والترتيب',
                'Optional mapping: descriptions, categories, images and sorting',
              )}
            </DisclosureSummary>
            <p>
              {t(
                'تُحفظ المطابقة المقترحة حتى إن أبقيت هذا الجزء مغلقًا. افتحه لتعديل الأعمدة الإضافية.',
                'Suggested mappings are kept when this section is closed. Open it to change additional columns.',
              )}
            </p>
            {mapColumns(labels.slice(2))}
          </details>
          <h3>{t('الحقول والأسعار التي تريد عرضها', 'Fields and prices to display')}</h3>
          {headers
            .filter((h) => h !== mapping.id && h !== mapping.name)
            .map((h) => {
              const f = mapping.fields.find((f) => f.column === h);
              return (
                <div key={h} className={styles.mappingRow}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!!f}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          fields: e.target.checked
                            ? [
                                ...mapping.fields,
                                {
                                  column: h,
                                  label: h,
                                  kind: /price|cost|سعر|اسعار|أسعار|تكلف/i.test(h)
                                    ? 'price'
                                    : 'text',
                                },
                              ]
                            : mapping.fields.filter((f) => f.column !== h),
                        })
                      }
                    />
                    {h}
                  </label>
                  {f && (
                    <>
                      <input
                        aria-label={t('اسم العرض لـ ', 'Display label for ') + h}
                        value={f.label}
                        onChange={(e) =>
                          setMapping({
                            ...mapping,
                            fields: mapping.fields.map((v) =>
                              v.column === h ? { ...v, label: e.target.value } : v,
                            ),
                          })
                        }
                      />
                      <select
                        aria-label={t('نوع الحقل ', 'Field type ') + h}
                        value={f.kind}
                        onChange={(e) =>
                          setMapping({
                            ...mapping,
                            fields: mapping.fields.map((v) =>
                              v.column === h
                                ? { ...v, kind: e.target.value as 'text' | 'price' }
                                : v,
                            ),
                          })
                        }
                      >
                        <option value="text">{t('نص', 'Text')}</option>
                        <option value="price">{t('سعر كما هو مكتوب', 'Price as written')}</option>
                      </select>
                    </>
                  )}
                </div>
              );
            })}
          {sample.length > 0 && (
            <details>
              <DisclosureSummary>
                {t('معاينة البيانات الأصلية', 'Preview original rows')}
              </DisclosureSummary>
              <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
                <table>
                  <thead>
                    <tr>
                      {headers.map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sample.map((r, i) => (
                      <tr key={i}>
                        {headers.map((h, j) => (
                          <td key={h}>{r[j]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
      {step === 1 && (
        <details>
          <DisclosureSummary>
            {t('إعدادات متقدمة للمساعد', 'Advanced assistant settings')}
          </DisclosureSummary>
          <label>
            <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} />
            {t(
              'اعتماد الكتالوج لردود المساعد: الإجابات من بياناته الحالية فقط، والتحويل للموظف للمعلومات الناقصة',
              'Use this catalog for assistant replies: current catalog data only, with staff handoff for missing information',
            )}
          </label>
        </details>
      )}
      {step === 1 && dirty && (
        <p role="status">
          {t(
            'احفظ تغييرات الربط قبل معاينة المزامنة',
            'Save source changes before previewing sync',
          )}
        </p>
      )}
      {step === 1 && (
        <div className={styles.actions}>
          <button className="btn" disabled={busy} onClick={() => setStep(0)}>
            {t('السابق', 'Back')}
          </button>
          <button
            className="btn btn-primary"
            disabled={
              busy || !name.trim() || !mapping.id || !mapping.name || (kind === 'file' && !file)
            }
            onClick={() =>
              void act(async () => {
                const source = !editing || dirty ? await save() : editing;
                await makePreview(source);
                setStep(2);
              })
            }
          >
            {busy
              ? t('جارٍ تجهيز المعاينة…', 'Preparing preview…')
              : t('التالي: معاينة البيانات', 'Next: preview data')}
          </button>
        </div>
      )}
      {preview && (step === 2 || step === 3) && (
        <section aria-label={t('معاينة التحديث', 'Update preview')}>
          <h3>
            {t('معاينة التحديث', 'Update preview')} — {preview.total}
            {hiddenCount > 0 && ` · ${hiddenCount} ${t('عنصر مخفي', 'hidden item(s)')}`}
          </h3>
          <ImportSummary counts={preview.summary} />
          {!preview.valid && <p role="alert">{t('لم يتم استيراد أي صف. أصلح الأخطاء ثم أعد المعاينة.', 'No rows were imported. Fix the errors and preview again.')}</p>}
          {!!preview.errors.length && <button type="button" className="btn" onClick={() => {
            const url = URL.createObjectURL(new Blob([JSON.stringify({source: editing?.name, errors: preview.errors}, null, 2)], {type: 'application/json'}));
            const link = document.createElement('a'); link.href = url; link.download = 'import-errors.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}>{t('تنزيل تقرير الأخطاء', 'Download error report')}</button>}
          {preview.errors.map((e, i) => (
            <p role="alert" key={i}>
              {t('صف ', 'Row ')}
              {e.row}: {e.message}
            </p>
          ))}
          {step === 2 && (
            <div className={styles.previewTable} tabIndex={0} role="region" aria-label={t('جدول معاينة المنتجات', 'Product preview table')}>
              <table><thead><tr>
                <th>{t('الاسم', 'Name')}</th><th>{t('الوصف', 'Description')}</th>
                <th>{t('القسم', 'Category')}</th><th>{t('البيانات الإضافية', 'Extra data')}</th>
              </tr></thead><tbody>
              {preview.items.map((p, i) => <tr key={i}>
                <td>{p.name}{p.visible === false && <small> · {t('مخفي', 'Hidden')}</small>}</td>
                <td>{p.description || '—'}</td><td>{p.category || t('دون قسم', 'Uncategorized')}</td>
                <td>{p.fields?.map((f) => <div key={f.label}>{f.label}: {f.value}</div>)}</td>
              </tr>)}
              </tbody></table>
            </div>
          )}
          {step === 2 && (
            <div className={styles.actions}>
              <button className="btn" disabled={busy} onClick={() => setStep(1)}>
                {t('تعديل المطابقة', 'Edit mapping')}
              </button>
              <button
                className="btn btn-primary"
                disabled={busy || !preview.valid}
                onClick={() => setStep(3)}
              >
                {t('التالي: تأكيد الاستيراد', 'Next: confirm import')}
              </button>
            </div>
          )}
          {step === 3 && preview.valid && (
            <>
              <p><strong>{t('مصدر الاستيراد:', 'Import destination:')} {editing?.name}</strong></p>
              <p>{t('سيتم تطبيق المعاينة التي راجعتها فقط:', 'Only the reviewed preview will be applied:')} {preview.total} {t('عنصر', 'items')}</p>
              <button type="button" className="btn" disabled={busy} onClick={() => setStep(2)}>
                {t('العودة للمعاينة', 'Back to preview')}
              </button>
              <p>
                {t('صفوف مفقودة من النسخة الجديدة: ', 'Rows missing from this update: ')}
                {preview.missing}
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={archive}
                  onChange={(e) => setArchive(e.target.checked)}
                />
                {t(
                  'راجعت الملف الكامل وأريد أرشفة الصفوف المفقودة',
                  'I reviewed the complete file and want to archive missing rows',
                )}
              </label>
              {hiddenCount > 0 && (
                <label>
                  <input
                    type="checkbox"
                    checked={visibilityConfirmed}
                    onChange={(event) => setVisibilityConfirmed(event.target.checked)}
                  />
                  {t(
                    'راجعت العناصر المخفية في هذا التحديث',
                    'I reviewed hidden items in this update',
                  )}
                </label>
              )}
              <button
                className="btn btn-primary"
                disabled={busy || (hiddenCount > 0 && !visibilityConfirmed)}
                onClick={() =>
                  void act(async () => {
                    const applied = await api<ImportCounts & {processed: number}>('/commerce/sources/' + editing!.id + '/apply', {
                      method: 'POST',
                      body: JSON.stringify({
                        previewId: preview.previewId,
                        archiveMissing: archive,
                      }),
                    });
                    setAppliedCount(applied.processed);
                    setAppliedSummary(applied);
                    setStep(4);
                    setPreview(null);
                    setFile(null);
                    await refresh();
                    const latest = await api<Source[]>('/commerce/sources');
                    setEditing(latest.find((s) => s.id === editing!.id) ?? null);
                    await browse(0);
                  })
                }
              >
                {t('تطبيق التحديث المعروض', 'Apply previewed update')}
              </button>
            </>
          )}
        </section>
      )}
      {step === 4 && (
        <section className={styles.result} role="status">
          <h3>{t('اكتمل الاستيراد', 'Import complete')}</h3>
          <p><strong>{editing?.name}</strong></p>
          <p>
            {appliedCount}{' '}
            {t(
              'عنصر في التحديث المقبول. يمكنك مراجعة الكتالوج أدناه.',
              'items in the accepted update. Review your catalog below.',
            )}
          </p>
          <ImportSummary counts={appliedSummary} />
          {onApplied && editing && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => onApplied(editing.id)}
            >
              {t('استخدام المصدر في البوت', 'Use source in bot')}
            </button>
          )}
          <button className="btn" onClick={() => setStep(0)}>
            {t('إدارة هذا المصدر', 'Manage this source')}
          </button>
          <button className="btn" onClick={() => select(null)}>
            {t('استيراد ملف آخر', 'Import another file')}
          </button>
        </section>
      )}
      {editing && (step === 0 || step === 4) && (
        <>
          <div className="form-actions">
            <label>
              {t('بحث', 'Search')}
              <input value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <label>
              {t('القسم', 'Category')}
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">{t('كل الأقسام', 'All categories')}</option>
                {categories
                  .filter((c) => c.name.trim())
                  .map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.count})
                    </option>
                  ))}
              </select>
            </label>
            <button className="btn" disabled={busy} onClick={() => void act(() => browse(0))}>
              {t('عرض', 'Browse')}
            </button>
          </div>
          {items.map((p, i) => (
            <article className="card" key={i}>
              <strong>{p.name}</strong>
              <p>{p.category_path || t('دون قسم', 'Uncategorized')}</p>
              <p>{p.description}</p>
              {p.dynamic_fields?.map((f) => (
                <p key={f.label}>
                  {f.label}: {f.value}
                </p>
              ))}
            </article>
          ))}
          {total > 0 && (
            <div className="form-actions">
              <button
                className="btn"
                disabled={busy || page === 0}
                onClick={() => void act(() => browse(page - 1))}
              >
                {t('السابق', 'Previous')}
              </button>
              <span>
                {page + 1} / {Math.ceil(total / 8)}
              </span>
              <button
                className="btn"
                disabled={busy || (page + 1) * 8 >= total}
                onClick={() => void act(() => browse(page + 1))}
              >
                {t('التالي', 'Next')}
              </button>
            </div>
          )}
          {runs.length > 0 && (
            <details>
              <DisclosureSummary>{t('سجل المزامنة', 'Sync history')}</DisclosureSummary>
              {runs.map((r, i) => (
                <section key={i}>
                <p>
                  {new Date(r.created_at).toLocaleString(language)} —{' '}
                  {r.status === 'success' ? t('نجاح', 'Success') : t('فشل', 'Failed')} —{' '}
                  {r.item_count}{' '}
                  {r.error &&
                    t('النسخة السليمة السابقة محفوظة', 'Last successful version retained')}
                </p>
                <ImportSummary counts={r.summary} />
                </section>
              ))}
            </details>
          )}
        </>
      )}
    </section>
  );
}
