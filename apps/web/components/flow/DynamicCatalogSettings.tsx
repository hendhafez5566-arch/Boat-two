'use client';
import { useEffect, useState } from 'react';
import DataSourcesPanel from '../workspace/DataSourcesPanel';
import { Dialog } from '../product/ProductUI';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
type Source = { id: string; name: string; mapping: { fields: { label: string }[] } };
export default function DynamicCatalogSettings({
  data,
  set,
}: {
  data: {
    sourceId?: string;
    category?: string;
    query?: string;
    fields?: string[];
    emptyText?: string;
  };
  set: (v: Record<string, unknown>) => void;
}) {
  const { t } = useLocale();
  const [manageOpen, setManageOpen] = useState(false);
  const [sources, setSources] = useState<Source[]>([]),
    [categories, setCategories] = useState<{ name: string; count: number }[]>([]),
    [error, setError] = useState('');
  async function refreshSources() {
    setError('');
    try {
      const next = await api<Source[]>('/commerce/sources');
      setSources(next);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }
  useEffect(() => {
    void refreshSources();
  }, []);
  useEffect(() => {
    setCategories([]);
    if (data.sourceId)
      api<typeof categories>('/commerce/sources/' + data.sourceId + '/categories')
        .then(setCategories)
        .catch((e) => setError(e.message));
  }, [data.sourceId]);
  return (
    <section>
      <label>
        {t('محتوى الكتالوج', 'Catalog content')}
        <select
          value={data.sourceId ? 'dynamic' : 'manual'}
          onChange={(e) =>
            set(
              e.target.value === 'dynamic'
                ? { sourceId: sources[0]?.id, selectable: true, native: false }
                : { sourceId: undefined },
            )
          }
        >
          <option value="manual">{t('منتجات محددة', 'Selected products')}</option>
          <option value="dynamic" disabled={!sources.length}>
            {t('قسم ديناميكي من مصدر بيانات', 'Dynamic data source category')}
          </option>
        </select>
      </label>
      <button type="button" className="btn" onClick={() => setManageOpen(true)}>
        {t('إضافة أو تحديث مصدر البيانات', 'Add or update a data source')}
      </button>
      <Dialog
        open={manageOpen}
        onClose={() => {
          setManageOpen(false);
          void refreshSources();
        }}
        title={t('كتالوج البوت', 'Bot catalog')}
        className="catalog-source-dialog"
      >
        {manageOpen && (
          <DataSourcesPanel
            onApplied={async (sourceId) => {
              if (await refreshSources()) {
                set({ sourceId, category: '', fields: [], native: false, selectable: true });
                setManageOpen(false);
              }
            }}
          />
        )}
      </Dialog>
      {error && <p role="alert">{error}</p>}
      {data.sourceId && (
        <>
          <label>
            {t('مصدر البيانات', 'Data source')}
            <select
              value={data.sourceId}
              onChange={(e) =>
                set({
                  sourceId: e.target.value,
                  category: '',
                  fields: [],
                  native: false,
                  selectable: true,
                })
              }
            >
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('القسم', 'Category')}
            <select value={data.category ?? ''} onChange={(e) => set({ category: e.target.value })}>
              <option value="">
                {t('قائمة الأقسام تلقائيًا', 'Browse categories automatically')}
              </option>
              {categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
          </label>
          <label>
            {t(
              'بحث اختياري — يدعم متغيرات المحادثة',
              'Optional search — supports conversation variables',
            )}
            <input
              value={data.query ?? ''}
              placeholder="{{search}}"
              onChange={(e) => set({ query: e.target.value })}
            />
          </label>
          <fieldset>
            <legend>
              {t(
                'الحقول المسموح عرضها — تركها دون تحديد يعرض كل الحقول المعتمدة',
                'Allowed fields — leave unchecked to show all approved fields',
              )}
            </legend>
            {sources
              .find((s) => s.id === data.sourceId)
              ?.mapping.fields.map((f) => (
                <label key={f.label}>
                  <input
                    type="checkbox"
                    checked={data.fields?.includes(f.label) ?? false}
                    onChange={(e) =>
                      set({
                        fields: e.target.checked
                          ? [...(data.fields ?? []), f.label]
                          : (data.fields ?? []).filter((v) => v !== f.label),
                      })
                    }
                  />
                  {f.label}
                </label>
              ))}
          </fieldset>
          <label>
            {t('رسالة عدم وجود نتائج', 'No results message')}
            <input
              value={data.emptyText ?? ''}
              onChange={(e) => set({ emptyText: e.target.value })}
            />
          </label>
          <p>
            {t(
              'قائمة بصفحات تلقائية. عند الاختيار يعرض التفاصيل ويسجل الاستفسار ثم ينتقل عبر المخرج التالي؛ وصّله بالتحويل للموظف عند الحاجة.',
              'Automatically paginated list. Selection shows current details, records the inquiry and follows the next output; connect it to staff handoff when needed.',
            )}
          </p>
        </>
      )}
    </section>
  );
}
