'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
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
  previewId?: string;
  items: Item[];
  total: number;
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
}: { onApplied?: (sourceId: string) => void } = {}) {
  const { t, language } = useLocale();
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
      { status: string; item_count: number; error?: string; created_at: string }[]
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
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function select(s: Source | null) {
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
    setFile(null);
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
  return (
    <section dir={language === 'ar' ? 'rtl' : 'ltr'} className="panel" style={{ minWidth: 0 }}>
      <h2>{t('مصادر البيانات والكتالوج الديناميكي', 'Data sources and dynamic catalog')}</h2>
      <ol className="catalog-steps" aria-label={t('خطوات إعداد الكتالوج', 'Catalog setup steps')}>
        <li>{t('١. ارفع ملفًا أو اربط شيت', '1. Upload a file or connect a sheet')}</li>
        <li>{t('٢. راجع الأعمدة ومعاينة العميل', '2. Review columns and customer preview')}</li>
        <li>{t('٣. طبّق التحديث واستخدمه في البوت', '3. Apply and use in your bot')}</li>
      </ol>
      <p>
        {t(
          'صمّم البوت مرة واحدة وحدّث المحتوى من هنا. الملفات المحلية تتطلب رفع نسخة أحدث.',
          'Design your bot once and update its content here. Local files require a newer upload.',
        )}
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <label>
          {t('المصدر', 'Source')}
          <select
            aria-label={t('المصدر', 'Source')}
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
        <button className="btn" onClick={() => select(null)}>
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
          <label>
            {t('رفع ملف .xlsx أو .csv — حتى 5 MB', 'Upload .xlsx or .csv — up to 5 MB')}
            <input
              disabled={busy}
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void act(() => upload(f));
              }}
            />
          </label>
          {sheets.length > 0 && (
            <label>
              {t('ورقة العمل', 'Worksheet')}
              <select
                value={sheet}
                onChange={(e) => {
                  setSheet(e.target.value);
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
                const r = await google({ operation: 'sheet_metadata', spreadsheetId: spreadsheet });
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
      {headers.length > 0 && (
        <>
          <h3>{t('راجع الأعمدة المقترحة', 'Review suggested columns')}</h3>
          <p>
            {t(
              'راجع المعرّف والاسم. الأعمدة الإضافية لا تظهر للعميل إلا باختيارك.',
              'Check the stable key and name. Extra columns are shown only when you select them.',
            )}
          </p>
          <div className="form-grid">
            {labels.map(([key, ar, en]) => (
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
              </label>
            ))}
          </div>
          <h3>{t('الحقول والأسعار التي تريد عرضها', 'Fields and prices to display')}</h3>
          {headers
            .filter((h) => h !== mapping.id && h !== mapping.name)
            .map((h) => {
              const f = mapping.fields.find((f) => f.column === h);
              return (
                <div key={h} className="form-actions">
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
              <summary>{t('معاينة البيانات الأصلية', 'Preview original rows')}</summary>
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
      <details>
        <summary>{t('إعدادات متقدمة للمساعد', 'Advanced assistant settings')}</summary>
        <label>
          <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} />
          {t(
            'اعتماد الكتالوج لردود المساعد: الإجابات من بياناته الحالية فقط، والتحويل للموظف للمعلومات الناقصة',
            'Use this catalog for assistant replies: current catalog data only, with staff handoff for missing information',
          )}
        </label>
      </details>
      {dirty && (
        <p role="status">
          {t(
            'احفظ تغييرات الربط قبل معاينة المزامنة',
            'Save source changes before previewing sync',
          )}
        </p>
      )}
      <div className="form-actions">
        <button
          className="btn primary"
          disabled={busy || !name || !mapping.id || !mapping.name || (kind === 'file' && !file)}
          onClick={() =>
            void act(async () => {
              const source = !editing || dirty ? await save() : editing;
              await makePreview(source);
            })
          }
        >
          {t('مراجعة معاينة العميل', 'Review customer preview')}
        </button>
        <button
          disabled={busy || !name || !mapping.id || !mapping.name}
          className="btn primary"
          onClick={() => void act(save)}
        >
          {t('حفظ الربط والإعدادات', 'Save source settings')}
        </button>
        <button
          disabled={busy || !editing || dirty}
          className="btn"
          onClick={() => void act(() => makePreview())}
        >
          {t('مزامنة الآن ومعاينة التحديث', 'Sync now and preview update')}
        </button>
        <button
          disabled={busy || !editing}
          className="btn"
          onClick={() => void act(() => browse(0))}
        >
          {t('معاينة ما يراه العميل والسجل', 'Preview customer catalog and history')}
        </button>
      </div>
      {preview && (
        <section aria-label={t('معاينة التحديث', 'Update preview')}>
          <h3>
            {t('معاينة التحديث', 'Update preview')} — {preview.total}
          </h3>
          {preview.errors.map((e, i) => (
            <p role="alert" key={i}>
              {t('صف ', 'Row ')}
              {e.row}: {e.message}
            </p>
          ))}
          {preview.items.map((p, i) => (
            <article className="card" key={i}>
              <strong>{p.name}</strong>
              <p>{p.description}</p>
              <p>
                {p.category} {p.visible === false ? t('مخفي', 'Hidden') : ''}
              </p>
              {p.fields?.map((f) => (
                <p key={f.label}>
                  {f.label}: {f.value}
                </p>
              ))}
            </article>
          ))}
          {preview.valid && (
            <>
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
              {preview.items.some((item) => item.visible === false) && (
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
                className="btn primary"
                disabled={
                  busy ||
                  (preview.items.some((item) => item.visible === false) && !visibilityConfirmed)
                }
                onClick={() =>
                  void act(async () => {
                    await api('/commerce/sources/' + editing!.id + '/apply', {
                      method: 'POST',
                      body: JSON.stringify({
                        previewId: preview.previewId,
                        archiveMissing: archive,
                      }),
                    });
                    setPreview(null);
                    await refresh();
                    const latest = await api<Source[]>('/commerce/sources');
                    setEditing(latest.find((s) => s.id === editing!.id) ?? null);
                    await browse(0);
                    onApplied?.(editing!.id);
                  })
                }
              >
                {t('تطبيق التحديث المعروض', 'Apply previewed update')}
              </button>
            </>
          )}
        </section>
      )}
      {editing && (
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
                {categories.map((c) => (
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
              <p>{p.category_path}</p>
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
              <summary>{t('سجل المزامنة', 'Sync history')}</summary>
              {runs.map((r, i) => (
                <p key={i}>
                  {new Date(r.created_at).toLocaleString(language)} —{' '}
                  {r.status === 'success' ? t('نجاح', 'Success') : t('فشل', 'Failed')} —{' '}
                  {r.item_count}{' '}
                  {r.error &&
                    t('النسخة السليمة السابقة محفوظة', 'Last successful version retained')}
                </p>
              ))}
            </details>
          )}
        </>
      )}
    </section>
  );
}
