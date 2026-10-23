'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useLocale } from '../product/locale';
import { NodeIcon, nodeLabel, editorLabel } from './presentation';
import { api } from '../../lib/api';
import { ReactNode, useEffect, useState } from 'react';
import { NodeType, optionsOf, uid } from '../../lib/flow-types';

const inp = 'w-full rounded border p-1.5 text-sm';

function F({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const { language } = useLocale();
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-semibold text-gray-600">
        {editorLabel(label, language)}
      </span>
      {children}
      {hint && <span className="mt-0.5 block text-xs text-gray-400">{hint}</span>}
    </label>
  );
}
const Txt = ({
  v,
  on,
  rows = 3,
  ph,
}: {
  v?: string;
  on: (s: string) => void;
  rows?: number;
  ph?: string;
}) => (
  <textarea
    className={inp}
    rows={rows}
    value={v ?? ''}
    placeholder={ph}
    onChange={(e) => on(e.target.value)}
  />
);
const In = ({
  v,
  on,
  ph,
  dir,
}: {
  v?: string | number;
  on: (s: string) => void;
  ph?: string;
  dir?: string;
}) => (
  <input
    className={inp}
    value={v ?? ''}
    placeholder={ph}
    dir={dir}
    onChange={(e) => on(e.target.value)}
  />
);
const Sel = ({
  v,
  on,
  opts,
}: {
  v?: string;
  on: (s: string) => void;
  opts: [string, string][];
}) => (
  <select className={inp} value={v} onChange={(e) => on(e.target.value)}>
    {opts.map(([k, l]) => (
      <option key={k} value={k}>
        {l}
      </option>
    ))}
  </select>
);
const Btn = ({
  on,
  children,
  danger,
}: {
  on: () => void;
  children: ReactNode;
  danger?: boolean;
}) => (
  <button
    type="button"
    onClick={on}
    className={`rounded border px-2 py-1 text-xs ${danger ? 'text-red-600' : ''}`}
  >
    {children}
  </button>
);

const DAYS: [string, string][] = [
  ['sun', 'الأحد'],
  ['mon', 'الإثنين'],
  ['tue', 'الثلاثاء'],
  ['wed', 'الأربعاء'],
  ['thu', 'الخميس'],
  ['fri', 'الجمعة'],
  ['sat', 'السبت'],
];
const fmtRanges = (r?: [string, string][]) => (r ?? []).map(([a, b]) => `${a}-${b}`).join(', ');
const parseRanges = (s: string): [string, string][] =>
  s
    .split(',')
    .map((x) => x.trim().match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/))
    .filter(Boolean)
    .map((m) => [m![1], m![2]] as [string, string]);

export default function Inspector({
  type,
  data,
  onChange,
  isStart,
  onSetStart,
  onDelete,
}: {
  type: NodeType;
  data: any;
  onChange: (d: any) => void;
  isStart: boolean;
  onSetStart: () => void;
  onDelete: () => void;
}) {
  const [components, setComponents] = useState<
    { id: string; name: string; is_component: boolean; status: string }[]
  >([]);
  useEffect(() => {
    if (type === 'subflow')
      api<typeof components>('/flows')
        .then(setComponents)
        .catch(() => {});
  }, [type]);
  const set = (patch: any) => onChange({ ...data, ...patch });
  const { language, t } = useLocale();
  const mode = data.list?.sections?.length ? 'list' : data.buttons?.length ? 'buttons' : 'none';

  return (
    <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="flow-inspector-content p-3">
      <div className="mb-3 flex items-center justify-between">
        <strong>
          <NodeIcon type={type} /> {nodeLabel(type, language)}
        </strong>
        <div className="flex gap-2">
          {!isStart && <Btn on={onSetStart}>{t('اجعلها البداية', 'Make start')}</Btn>}
          <Btn on={onDelete} danger>
            {t('حذف', 'Delete')}
          </Btn>
        </div>
      </div>
      <p className="mb-3 text-xs text-gray-400">
        يمكنك استخدام المتغيرات في النصوص بهذا الشكل: {'{{name}}'} أو {'{{contact.name}}'}
      </p>

      {type === 'subflow' && (
        <F label="المكوّن المنشور" hint="تُثبت نسخة المكوّن عند نشر البوت الرئيسي.">
          <Sel
            v={data.flowId}
            on={(flowId) => set({ flowId })}
            opts={[
              ['', 'اختر مكوّنًا'],
              ...components
                .filter((c) => c.is_component && c.status === 'published')
                .map((c) => [c.id, c.name] as [string, string]),
            ]}
          />
        </F>
      )}
      {type === 'message' && (
        <>
          <F label="نص الرسالة">
            <Txt v={data.text} on={(text) => set({ text })} rows={4} />
          </F>
          <F label="مرفق (اختياري)">
            <Sel
              v={data.media?.kind ?? ''}
              on={(k) =>
                set({
                  media: k
                    ? { ...(data.media ?? {}), kind: k, url: data.media?.url ?? '' }
                    : undefined,
                })
              }
              opts={[
                ['', 'بدون'],
                ['image', 'صورة'],
                ['video', 'فيديو'],
                ['audio', 'صوت'],
                ['file', 'ملف'],
              ]}
            />
            {data.media && (
              <div className="mt-1 space-y-1">
                <In
                  v={data.media.url}
                  on={(url) => set({ media: { ...data.media, url } })}
                  ph="https://…"
                  dir="ltr"
                />
                <In
                  v={data.media.caption}
                  on={(caption) => set({ media: { ...data.media, caption } })}
                  ph="تعليق"
                />
              </div>
            )}
          </F>
          <F label="خيارات الرد">
            <Sel
              v={mode}
              on={(m) =>
                set({
                  buttons: m === 'buttons' ? [{ id: uid(), title: 'خيار 1' }] : undefined,
                  list:
                    m === 'list'
                      ? {
                          buttonText: 'القائمة',
                          sections: [{ rows: [{ id: uid(), title: 'خيار 1' }] }],
                        }
                      : undefined,
                })
              }
              opts={[
                ['none', 'بدون (يكمل مباشرة)'],
                ['buttons', 'أزرار (حتى 3)'],
                ['list', 'قائمة (حتى 10)'],
              ]}
            />
          </F>
          {mode === 'buttons' && (
            <>
              {data.buttons.map((b: any, i: number) => (
                <div key={b.id} className="mb-1 flex gap-1">
                  <In
                    v={b.title}
                    on={(title) =>
                      set({
                        buttons: data.buttons.map((x: any, j: number) =>
                          j === i ? { ...x, title: title.slice(0, 20) } : x,
                        ),
                      })
                    }
                  />
                  <Btn
                    danger
                    on={() => {
                      const buttons = data.buttons.filter((_: any, j: number) => j !== i);
                      set({ buttons: buttons.length ? buttons : undefined });
                    }}
                  >
                    ×
                  </Btn>
                </div>
              ))}
              {data.buttons.length < 3 && (
                <Btn
                  on={() =>
                    set({
                      buttons: [
                        ...data.buttons,
                        { id: uid(), title: `خيار ${data.buttons.length + 1}` },
                      ],
                    })
                  }
                >
                  + زر
                </Btn>
              )}
              <p className="mt-1 text-xs text-gray-400">الحد الأقصى لعنوان الزر 20 حرف.</p>
            </>
          )}
          {mode === 'list' && (
            <>
              <F label="نص زر فتح القائمة">
                <In
                  v={data.list.buttonText}
                  on={(buttonText) =>
                    set({ list: { ...data.list, buttonText: buttonText.slice(0, 20) } })
                  }
                />
              </F>
              {data.list.sections[0].rows.map((r: any, i: number) => (
                <div key={r.id} className="mb-1 flex gap-1">
                  <In
                    v={r.title}
                    on={(title) => {
                      const rows = data.list.sections[0].rows.map((x: any, j: number) =>
                        j === i ? { ...x, title: title.slice(0, 24) } : x,
                      );
                      set({
                        list: { ...data.list, sections: [{ ...data.list.sections[0], rows }] },
                      });
                    }}
                  />
                  <Btn
                    danger
                    on={() => {
                      const rows = data.list.sections[0].rows.filter(
                        (_: any, j: number) => j !== i,
                      );
                      set(
                        rows.length
                          ? {
                              list: {
                                ...data.list,
                                sections: [{ ...data.list.sections[0], rows }],
                              },
                            }
                          : { list: undefined },
                      );
                    }}
                  >
                    ×
                  </Btn>
                </div>
              ))}
              {data.list.sections[0].rows.length < 10 && (
                <Btn
                  on={() =>
                    set({
                      list: {
                        ...data.list,
                        sections: [
                          {
                            ...data.list.sections[0],
                            rows: [
                              ...data.list.sections[0].rows,
                              { id: uid(), title: `خيار ${data.list.sections[0].rows.length + 1}` },
                            ],
                          },
                        ],
                      },
                    })
                  }
                >
                  + صف
                </Btn>
              )}
            </>
          )}
          {optionsOf(data).length > 0 && (
            <F label="حفظ اختيار العميل في متغيّر" hint="يُحفظ العنوان، ويُحفظ المعرّف في {اسم}_id">
              <In
                v={data.saveReplyAs}
                on={(saveReplyAs) => set({ saveReplyAs: saveReplyAs || undefined })}
                ph="choice"
                dir="ltr"
              />
            </F>
          )}
        </>
      )}

      {type === 'question' && (
        <>
          <F label="نص السؤال">
            <Txt v={data.text} on={(text) => set({ text })} />
          </F>
          <F label="نوع الإجابة المقبولة">
            <Sel
              v={data.answerType}
              on={(answerType) => set({ answerType })}
              opts={[
                ['text', 'نص حر'],
                ['number', 'رقم'],
                ['email', 'إيميل'],
                ['phone', 'رقم هاتف'],
                ['regex', 'نمط مخصص (Regex)'],
              ]}
            />
          </F>
          {data.answerType === 'regex' && (
            <F label="النمط">
              <In v={data.pattern} on={(pattern) => set({ pattern })} dir="ltr" />
            </F>
          )}
          <F label="احفظ الإجابة في متغيّر">
            <In v={data.saveAs} on={(saveAs) => set({ saveAs })} dir="ltr" />
          </F>
          <F label="عدد المحاولات عند الإجابة الخاطئة">
            <In
              v={data.retries ?? 2}
              on={(n) => set({ retries: Math.max(0, Math.min(5, Number(n) || 0)) })}
            />
          </F>
          <F label="رسالة الخطأ (اختياري)" hint="لو تُركت فارغة يُعاد السؤال نفسه">
            <Txt
              v={data.errorText}
              on={(errorText) => set({ errorText: errorText || undefined })}
              rows={2}
            />
          </F>
        </>
      )}

      {type === 'condition' && (
        <>
          {data.rules.map((r: any, ri: number) => (
            <div key={r.id} className="mb-3 rounded border p-2">
              <div className="mb-1 flex items-center justify-between text-xs">
                <strong>شرط {ri + 1}</strong>
                <span className="flex items-center gap-1">
                  <Sel
                    v={r.match}
                    on={(match) =>
                      set({
                        rules: data.rules.map((x: any, j: number) =>
                          j === ri ? { ...x, match } : x,
                        ),
                      })
                    }
                    opts={[
                      ['all', 'كل الشروط'],
                      ['any', 'أي شرط'],
                    ]}
                  />
                  <Btn
                    danger
                    on={() => set({ rules: data.rules.filter((_: any, j: number) => j !== ri) })}
                  >
                    ×
                  </Btn>
                </span>
              </div>
              {r.conditions.map((c: any, ci: number) => {
                const upd = (patch: any) =>
                  set({
                    rules: data.rules.map((x: any, j: number) =>
                      j === ri
                        ? {
                            ...x,
                            conditions: x.conditions.map((y: any, k: number) =>
                              k === ci ? { ...y, ...patch } : y,
                            ),
                          }
                        : x,
                    ),
                  });
                return (
                  <div key={ci} className="mb-2 space-y-1 border-b pb-2">
                    <Sel
                      v={c.source}
                      on={(source) => upd({ source })}
                      opts={[
                        ['variable', 'متغيّر'],
                        ['last_message', 'آخر رسالة'],
                        ['contact_field', 'حقل العميل (name/phone/email)'],
                        ['contact_attribute', 'بيان مخصص للعميل'],
                        ['channel', 'القناة'],
                      ]}
                    />
                    {['variable', 'contact_field', 'contact_attribute'].includes(c.source) && (
                      <In v={c.key} on={(key) => upd({ key })} ph="الاسم" dir="ltr" />
                    )}
                    <Sel
                      v={c.operator}
                      on={(operator) => upd({ operator })}
                      opts={[
                        ['equals', 'يساوي'],
                        ['not_equals', 'لا يساوي'],
                        ['contains', 'يحتوي'],
                        ['not_contains', 'لا يحتوي'],
                        ['starts_with', 'يبدأ بـ'],
                        ['ends_with', 'ينتهي بـ'],
                        ['greater_than', 'أكبر من'],
                        ['less_than', 'أصغر من'],
                        ['is_set', 'موجود'],
                        ['is_not_set', 'غير موجود'],
                        ['matches_regex', 'يطابق Regex'],
                      ]}
                    />
                    {!['is_set', 'is_not_set'].includes(c.operator) && (
                      <In v={c.value} on={(value) => upd({ value })} ph="القيمة" />
                    )}
                    {r.conditions.length > 1 && (
                      <Btn
                        danger
                        on={() =>
                          set({
                            rules: data.rules.map((x: any, j: number) =>
                              j === ri
                                ? {
                                    ...x,
                                    conditions: x.conditions.filter(
                                      (_: any, k: number) => k !== ci,
                                    ),
                                  }
                                : x,
                            ),
                          })
                        }
                      >
                        حذف الشرط
                      </Btn>
                    )}
                  </div>
                );
              })}
              <Btn
                on={() =>
                  set({
                    rules: data.rules.map((x: any, j: number) =>
                      j === ri
                        ? {
                            ...x,
                            conditions: [
                              ...x.conditions,
                              { source: 'variable', key: '', operator: 'equals', value: '' },
                            ],
                          }
                        : x,
                    ),
                  })
                }
              >
                + شرط داخل المجموعة
              </Btn>
            </div>
          ))}
          {data.rules.length < 15 && (
            <Btn
              on={() =>
                set({
                  rules: [
                    ...data.rules,
                    {
                      id: uid(),
                      match: 'all',
                      conditions: [{ source: 'variable', key: '', operator: 'equals', value: '' }],
                    },
                  ],
                })
              }
            >
              + مجموعة شروط
            </Btn>
          )}
          <p className="mt-2 text-xs text-gray-400">
            تُفحص المجموعات بالترتيب، وأول مجموعة تتحقق هي التي تُتبع.
          </p>
        </>
      )}

      {type === 'set_variable' && (
        <>
          {data.assignments.map((a: any, i: number) => {
            const upd = (patch: any) =>
              set({
                assignments: data.assignments.map((x: any, j: number) =>
                  j === i ? { ...x, ...patch } : x,
                ),
              });
            return (
              <div key={i} className="mb-2 space-y-1 rounded border p-2">
                <In v={a.name} on={(name) => upd({ name })} ph="اسم المتغيّر" dir="ltr" />
                <Sel
                  v={a.operation}
                  on={(operation) => upd({ operation })}
                  opts={[
                    ['set', 'تعيين'],
                    ['increment', 'زيادة'],
                    ['clear', 'مسح'],
                  ]}
                />
                {a.operation !== 'clear' && (
                  <In
                    v={a.value}
                    on={(value) => upd({ value })}
                    ph={a.operation === 'increment' ? 'المقدار (افتراضي 1)' : 'القيمة'}
                  />
                )}
                <Btn
                  danger
                  on={() =>
                    set({ assignments: data.assignments.filter((_: any, j: number) => j !== i) })
                  }
                >
                  {t('حذف', 'Delete')}
                </Btn>
              </div>
            );
          })}
          <Btn
            on={() =>
              set({ assignments: [...data.assignments, { name: '', operation: 'set', value: '' }] })
            }
          >
            + إضافة
          </Btn>
        </>
      )}

      {type === 'set_attribute' && (
        <>
          <F label="اسم البيان" hint="يُحفظ على جهة الاتصال ويبقى بعد انتهاء المحادثة">
            <In v={data.key} on={(key) => set({ key })} dir="ltr" />
          </F>
          <F label="القيمة">
            <In v={data.value} on={(value) => set({ value })} />
          </F>
        </>
      )}

      {type === 'delay' && (
        <>
          <F label="المدة">
            <In v={data.amount} on={(n) => set({ amount: Number(n) || 0 })} />
          </F>
          <F label="الوحدة">
            <Sel
              v={data.unit}
              on={(unit) => set({ unit })}
              opts={[
                ['seconds', 'ثواني'],
                ['minutes', 'دقائق'],
                ['hours', 'ساعات'],
                ['days', 'أيام'],
              ]}
            />
          </F>
          <p className="text-xs text-gray-400">
            على واتساب: الرد الحر مسموح خلال 24 ساعة من آخر رسالة للعميل فقط.
          </p>
        </>
      )}

      {type === 'http_request' && (
        <>
          <F label="الطريقة">
            <Sel
              v={data.method}
              on={(method) => set({ method })}
              opts={[
                ['GET', 'GET'],
                ['POST', 'POST'],
                ['PUT', 'PUT'],
                ['PATCH', 'PATCH'],
                ['DELETE', 'DELETE'],
              ]}
            />
          </F>
          <F label="الرابط" hint="العناوين الداخلية/المحلية محظورة لأسباب أمنية">
            <In v={data.url} on={(url) => set({ url })} dir="ltr" />
          </F>
          <F label="Headers">
            {(data.headers ?? []).map((h: any, i: number) => (
              <div key={i} className="mb-1 flex gap-1">
                <In
                  v={h.key}
                  on={(key) =>
                    set({
                      headers: data.headers.map((x: any, j: number) =>
                        j === i ? { ...x, key } : x,
                      ),
                    })
                  }
                  ph="Name"
                  dir="ltr"
                />
                <In
                  v={h.value}
                  on={(value) =>
                    set({
                      headers: data.headers.map((x: any, j: number) =>
                        j === i ? { ...x, value } : x,
                      ),
                    })
                  }
                  ph="Value"
                  dir="ltr"
                />
                <Btn
                  danger
                  on={() => set({ headers: data.headers.filter((_: any, j: number) => j !== i) })}
                >
                  ×
                </Btn>
              </div>
            ))}
            <Btn on={() => set({ headers: [...(data.headers ?? []), { key: '', value: '' }] })}>
              + Header
            </Btn>
          </F>
          {data.method !== 'GET' && (
            <F label="Body (JSON)">
              <Txt v={data.body} on={(body) => set({ body })} rows={4} />
            </F>
          )}
          <F label="حفظ من الرد" hint="مثال: المسار data.price ← المتغيّر price">
            {(data.saveAs ?? []).map((m: any, i: number) => (
              <div key={i} className="mb-1 flex gap-1">
                <In
                  v={m.path}
                  on={(path) =>
                    set({
                      saveAs: data.saveAs.map((x: any, j: number) =>
                        j === i ? { ...x, path } : x,
                      ),
                    })
                  }
                  ph="data.price"
                  dir="ltr"
                />
                <In
                  v={m.variable}
                  on={(variable) =>
                    set({
                      saveAs: data.saveAs.map((x: any, j: number) =>
                        j === i ? { ...x, variable } : x,
                      ),
                    })
                  }
                  ph="price"
                  dir="ltr"
                />
                <Btn
                  danger
                  on={() => set({ saveAs: data.saveAs.filter((_: any, j: number) => j !== i) })}
                >
                  ×
                </Btn>
              </div>
            ))}
            <Btn on={() => set({ saveAs: [...(data.saveAs ?? []), { path: '', variable: '' }] })}>
              + حقل
            </Btn>
          </F>
        </>
      )}

      {type === 'business_hours' && (
        <>
          <F label="المنطقة الزمنية" hint="مثل Africa/Cairo أو Asia/Riyadh">
            <In v={data.timezone} on={(timezone) => set({ timezone })} dir="ltr" />
          </F>
          {DAYS.map(([k, label]) => (
            <F
              key={k}
              label={label}
              hint={
                k === 'sun' ? 'الصيغة: 09:00-17:00, 19:00-22:00 (اتركها فارغة للإجازة)' : undefined
              }
            >
              <In
                v={fmtRanges(data.schedule?.[k])}
                on={(s) => set({ schedule: { ...data.schedule, [k]: parseRanges(s) } })}
                dir="ltr"
              />
            </F>
          ))}
        </>
      )}

      {type === 'split' && (
        <>
          {data.branches.map((b: any, i: number) => (
            <div key={b.id} className="mb-1 flex items-center gap-1">
              <span className="text-xs">فرع {i + 1}</span>
              <In
                v={b.weight}
                on={(w) =>
                  set({
                    branches: data.branches.map((x: any, j: number) =>
                      j === i ? { ...x, weight: Math.max(0, Number(w) || 0) } : x,
                    ),
                  })
                }
              />
              {data.branches.length > 2 && (
                <Btn
                  danger
                  on={() => set({ branches: data.branches.filter((_: any, j: number) => j !== i) })}
                >
                  ×
                </Btn>
              )}
            </div>
          ))}
          {data.branches.length < 10 && (
            <Btn on={() => set({ branches: [...data.branches, { id: uid(), weight: 50 }] })}>
              + فرع
            </Btn>
          )}
          <p className="mt-1 text-xs text-gray-400">الأوزان نسبية (مثلاً 50 و50 تعني نصف/نصف).</p>
        </>
      )}

      {type === 'ai_reply' && (
        <>
          <p className="mb-3 rounded bg-indigo-50 p-2 text-xs text-indigo-800">
            يرد المساعد الذكي من قاعدة المعرفة ويستمر في المحادثة مع العميل حتى يخرج منها. اربط
            مخرجَي "تحويل لموظف" و"فشل" بعقدة تحويل حتى لا يتعطل العميل أبداً.
          </p>
          <F label="رسالة ترحيب (اختياري)">
            <Txt
              v={data.greeting}
              on={(greeting) => set({ greeting: greeting || undefined })}
              rows={2}
            />
          </F>
          <F label="تعليمات إضافية لهذه العقدة" hint="مثال: ركّز على أسئلة الحجز فقط">
            <Txt
              v={data.instructions}
              on={(instructions) => set({ instructions: instructions || undefined })}
              rows={3}
            />
          </F>
          <F label="كلمات تنهي المحادثة مع المساعد" hint="مفصولة بفاصلة، مثل: شكرا، تمام، bye">
            <input
              className={inp}
              defaultValue={(data.exitKeywords ?? []).join('، ')}
              onBlur={(e) =>
                set({
                  exitKeywords: e.target.value
                    .split(/[,،]/)
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
          </F>
          <F label="أقصى عدد ردود قبل الخروج">
            <In
              v={data.maxTurns ?? 20}
              on={(n) => set({ maxTurns: Math.max(1, Math.min(50, Number(n) || 20)) })}
            />
          </F>
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={data.answerFirst !== false}
              onChange={(e) => set({ answerFirst: e.target.checked })}
            />{' '}
            أجب فوراً على الرسالة التي بدأت السيناريو
          </label>
          <p className="mb-3 text-xs text-gray-400">يعمل فقط لو كانت هذه العقدة هي البداية.</p>
          <F label="احفظ آخر رد في متغيّر (اختياري)">
            <In v={data.saveAnswerAs} on={(v) => set({ saveAnswerAs: v || undefined })} dir="ltr" />
          </F>
        </>
      )}

      {type === 'handoff' && (
        <>
          <F label="رسالة للعميل قبل التحويل">
            <Txt v={data.message} on={(message) => set({ message })} rows={2} />
          </F>
          <F label="تعيين لموظف (معرّف المستخدم، اختياري)">
            <In
              v={data.assignTo}
              on={(assignTo) => set({ assignTo: assignTo || undefined })}
              dir="ltr"
            />
          </F>
        </>
      )}

      {type === 'end' && (
        <>
          <F label="رسالة ختامية (اختياري)">
            <Txt
              v={data.message}
              on={(message) => set({ message: message || undefined })}
              rows={2}
            />
          </F>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!data.closeConversation}
              onChange={(e) => set({ closeConversation: e.target.checked })}
            />{' '}
            إغلاق المحادثة
          </label>
        </>
      )}
    </div>
  );
}
