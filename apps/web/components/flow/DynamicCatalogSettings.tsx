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
  const [sourceState, setSourceState] = useState({ dirty: false, busy: false });
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
    let active = true;
    setCategories([]);
    if (data.sourceId)
      api<typeof categories>('/commerce/sources/' + data.sourceId + '/categories')
        .then((next) => {
          if (active) setCategories(next);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
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
          if (sourceState.busy) return;
          if (
            sourceState.dirty &&
            !window.confirm(
              t(
                'توجد بيانات مصدر لم تُطبق. هل تريد إغلاقها؟ مسودة البوت محفوظة داخل المحرر.',
                'There are unapplied source changes. Close them? Your bot draft stays in the editor.',
              ),
            )
          )
            return;
          setManageOpen(false);
          void refreshSources();
        }}
        title={t('كتالوج البوت', 'Bot catalog')}
        className="catalog-source-dialog"
      >
        {manageOpen && (
          <DataSourcesPanel
            onDraftStateChange={setSourceState}
            onApplied={async (sourceId) => {
              if (await refreshSources()) {
                set({
                  sourceId,
                  ...(sourceId !== data.sourceId ? { category: '', fields: [] } : {}),
                  native: false,
                  selectable: true,
                });
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
          <fieldset className="min-w-0 rounded-lg border p-3">
            <legend className="px-1">
              {t(
                'الحقول المسموح عرضها — تركها دون تحديد يعرض كل الحقول المعتمدة',
                'Allowed fields — leave unchecked to show all approved fields',
              )}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {sources
                .find((s) => s.id === data.sourceId)
                ?.mapping.fields.map((f) => (
                  <label
                    key={f.label}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36 }}
                  >
                    <input
                      type="checkbox"
                      style={{ width: 16, height: 16, flexShrink: 0, margin: 0 }}
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
            </div>
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
