'use client';
import { useEffect, useId, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import styles from './automation-config.module.css';

export type ButtonAction =
  | { type: 'integration'; connectionId: string; payload: string }
  | { type: 'set_field'; key: string; value: string }
  | { type: 'tag'; add: string[]; remove: string[] }
  | { type: 'list'; listId: string; operation: 'add' | 'remove' }
  | { type: 'sequence'; sequenceId: string; operation: 'subscribe' | 'unsubscribe' }
  | { type: 'assign'; userId?: string; departmentId?: string }
  | { type: 'webhook'; url: string; body: string };

function TagInput({
  values,
  onCommit,
}: {
  values: string[];
  onCommit: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState(values.join(','));
  useEffect(() => setDraft(values.join(',')), [values]);
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() =>
        onCommit(
          draft
            .split(/[,،]/)
            .map((s) => s.trim())
            .filter(Boolean),
        )
      }
    />
  );
}

function IntegrationOperation({
  value,
  onChange,
  google,
}: {
  value: string;
  onChange: (value: string) => void;
  google: boolean;
}) {
  const { t } = useLocale();
  let payload: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed;
  } catch {
    /* Keep existing provider payload editable. */
  }
  if (
    !google ||
    !payload ||
    !['calendar_event', 'sheet_append'].includes(String(payload.operation))
  )
    return (
      <label>
        {t('بيانات العملية JSON', 'Operation JSON')}
        <textarea dir="ltr" rows={7} value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  const update = (key: string, next: unknown) =>
    onChange(JSON.stringify({ ...payload, [key]: next }, null, 2));
  const calendar = payload.operation === 'calendar_event';
  return (
    <div className={styles.form}>
      <label>
        {t('نوع العملية', 'Operation')}
        <select
          value={String(payload.operation)}
          onChange={(e) =>
            onChange(
              JSON.stringify(
                e.target.value === 'calendar_event'
                  ? {
                      operation: 'calendar_event',
                      calendarId: 'primary',
                      summary: '',
                      start: '',
                      end: '',
                      timezone: 'Africa/Cairo',
                    }
                  : {
                      operation: 'sheet_append',
                      spreadsheetId: '',
                      range: 'Sheet1!A:Z',
                      values: [['']],
                    },
                null,
                2,
              ),
            )
          }
        >
          <option value="calendar_event">
            {t('إنشاء موعد في Google Calendar', 'Create Google Calendar Event')}
          </option>
          <option value="sheet_append">
            {t('إضافة صف إلى Google Sheets', 'Append Google Sheets Row')}
          </option>
        </select>
      </label>
      {(calendar
        ? [
            ['calendarId', 'معرّف التقويم', 'Calendar ID'],
            ['summary', 'عنوان الموعد', 'Event Title'],
            [
              'start',
              'بداية الموعد، مثال 2026-12-25T14:30:00+02:00',
              'Start, e.g. 2026-12-25T14:30:00+02:00',
            ],
            ['end', 'نهاية الموعد بتوقيت المنطقة', 'End with UTC offset'],
            ['timezone', 'المنطقة الزمنية', 'Timezone'],
            ['description', 'الوصف', 'Description'],
          ]
        : [
            ['spreadsheetId', 'معرّف جدول البيانات', 'Spreadsheet ID'],
            ['range', 'نطاق الخلايا', 'Cell Range'],
          ]
      ).map(([key, ar, en]) => (
        <label key={key}>
          {t(ar, en)}
          <input
            dir={key === 'summary' || key === 'description' ? undefined : 'ltr'}
            value={String(payload?.[key] ?? '')}
            onChange={(e) => update(key, e.target.value)}
          />
        </label>
      ))}
      {!calendar && (
        <label>
          {t('قيم الصفوف JSON — تدعم المتغيرات', 'Row Values JSON — supports variables')}
          <JsonRows value={payload.values} onChange={(next) => update('values', next)} />
        </label>
      )}
    </div>
  );
}
function JsonRows({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const [draft, setDraft] = useState(JSON.stringify(value));
  const [error, setError] = useState(false);
  useEffect(() => setDraft(JSON.stringify(value)), [value]);
  return (
    <>
      <textarea
        dir="ltr"
        value={draft}
        aria-invalid={error}
        onChange={(e) => {
          setDraft(e.target.value);
          try {
            const rows = JSON.parse(e.target.value);
            if (!Array.isArray(rows) || rows.some((row) => !Array.isArray(row))) throw new Error();
            onChange(rows);
            setError(false);
          } catch {
            setError(true);
          }
        }}
      />
      {error && <span role="alert">JSON: [["value", "contact name"]]</span>}
    </>
  );
}

export default function ButtonActionsEditor({
  value = [],
  onChange,
  defaultValue = '',
}: {
  defaultValue?: string;
  value?: ButtonAction[];
  onChange: (v: ButtonAction[]) => void;
}) {
  const { t } = useLocale();
  const fieldListId = useId();
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [sequences, setSequences] = useState<{ id: string; name: string; status: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string; members: string[] }[]>(
    [],
  );
  const [staff, setStaff] = useState<{ user_id: string; full_name: string; email: string }[]>([]);
  const [failed, setFailed] = useState(false);
  const [fields, setFields] = useState<{ key: string; label: string }[]>([]);
  useEffect(() => {
    let active = true;
    api<typeof fields>('/crm/fields')
      .then((rows) => {
        if (active) setFields(rows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const [connections, setConnections] = useState<
    { id: string; provider: string; name: string; enabled: boolean }[]
  >([]);
  useEffect(() => {
    api<typeof connections>('/integrations')
      .then(setConnections)
      .catch(() => {});
  }, []);
  useEffect(() => {
    let active = true;
    Promise.allSettled([
      api<typeof lists>('/contact-lists'),
      api<typeof sequences>('/sequences'),
      api<typeof departments>('/departments'),
      api<{ members: typeof staff }>('/team'),
    ]).then((results) => {
      if (!active) return;
      const [a, b, c, d] = results;
      if (a.status === 'fulfilled') setLists(a.value);
      if (b.status === 'fulfilled') setSequences(b.value);
      if (c.status === 'fulfilled') setDepartments(c.value);
      if (d.status === 'fulfilled') setStaff(d.value.members ?? []);
      setFailed(results.some((r) => r.status === 'rejected'));
    });
    return () => {
      active = false;
    };
  }, []);
  const labels = {
    integration: t('Google Sheets / Calendar / مزود خارجي', 'Google Sheets / Calendar / provider'),
    set_field: t('حفظ حقل مخصص', 'Save custom field'),
    tag: t('إضافة / إزالة وسوم', 'Add / remove labels'),
    list: t('إضافة / إزالة من قائمة', 'Add / remove list membership'),
    sequence: t('اشتراك / إلغاء تسلسل', 'Subscribe / unsubscribe sequence'),
    assign: t('تحويل لموظف أو قسم', 'Assign employee or department'),
    webhook: t('إرسال Webhook', 'Send webhook'),
  };
  const patch = (i: number, action: ButtonAction) =>
    onChange(value.map((a, j) => (j === i ? action : a)));
  const pick = (
    current: string | undefined,
    rows: { id: string; name: string }[],
    onPick: (id: string) => void,
  ) => (
    <select value={current ?? ''} onChange={(e) => onPick(e.target.value)}>
      <option value="">{t('اختر…', 'Choose…')}</option>
      {current && !rows.some((r) => r.id === current) && (
        <option value={current}>{t('اختيار محفوظ غير متاح', 'Saved selection unavailable')}</option>
      )}
      {rows.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  );
  const defaults: Record<ButtonAction['type'], ButtonAction> = {
    integration: {
      type: 'integration',
      connectionId: '',
      payload: JSON.stringify(
        {
          operation: 'calendar_event',
          calendarId: 'primary',
          summary: 'Appointment',
          start: '',
          end: '',
          timezone: 'Africa/Cairo',
        },
        null,
        2,
      ),
    },
    set_field: { type: 'set_field', key: '', value: defaultValue },
    tag: { type: 'tag', add: [], remove: [] },
    list: { type: 'list', listId: lists[0]?.id ?? '', operation: 'add' },
    sequence: {
      type: 'sequence',
      sequenceId: sequences.find((s) => s.status === 'active')?.id ?? '',
      operation: 'subscribe',
    },
    assign: { type: 'assign' },
    webhook: { type: 'webhook', url: 'https://', body: '{}' },
  };
  const add = (type: ButtonAction['type']) => onChange([...value, defaults[type]]);
  return (
    <div className={styles.form}>
      <p className={styles.note}>
        {t(
          'اختر إعداد الأتمتة المطلوب. تُنفذ الإعدادات المحفوظة بالترتيب الموضح قبل الخطوة التالية.',
          'Choose the automation settings you need. Saved actions run in the numbered order before the next step.',
        )}
      </p>
      {failed && (
        <p role="status">
          {t(
            'تعذر تحميل بعض قوائم الاختيار. القيم المحفوظة لم تتغير.',
            'Some selections could not load. Saved values are unchanged.',
          )}
        </p>
      )}
      <div className={styles.grid}>
        {(Object.keys(labels) as ButtonAction['type'][]).map((type) => (
          <button
            type="button"
            className={styles.button}
            key={type}
            disabled={value.length >= 20}
            onClick={() => add(type)}
          >
            ＋ {labels[type]}
          </button>
        ))}
      </div>
      {value.map((a, i) => (
        <fieldset className={styles.section} key={i}>
          <legend>
            {i + 1}. {labels[a.type]}
          </legend>
          {a.type === 'integration' && (
            <>
              <label>
                {t('ملف ربط مأذون', 'Authorized connection')}
                {pick(
                  a.connectionId,
                  connections
                    .filter((c) => c.enabled && c.provider !== 'webhook')
                    .map((c) => ({ id: c.id, name: c.name + ' · ' + c.provider })),
                  (id) => patch(i, { ...a, connectionId: id }),
                )}
              </label>
              <IntegrationOperation
                value={a.payload}
                onChange={(payload) => patch(i, { ...a, payload })}
                google={connections.some((c) => c.id === a.connectionId && c.provider === 'google')}
              />
              <p>
                {t(
                  'Calendar: calendar_event مع calendarId/summary/start/end. Sheets: sheet_append مع spreadsheetId/range/values. مزود القوائم يستخدم موافقة العميل الحالي.',
                  'Calendar: calendar_event with calendarId/summary/start/end. Sheets: sheet_append with spreadsheetId/range/values. Mailing providers use the current contact consent.',
                )}
              </p>
              <a href="/dashboard/integrations" target="_blank" rel="noopener noreferrer">
                {t('إدارة التفويض والمعاينة', 'Manage authorization and preview')}
              </a>
            </>
          )}
          {a.type === 'set_field' && (
            <>
              <label>
                {t('اسم الحقل', 'Field key')}
                <input
                  list={`${fieldListId}-${i}`}
                  dir="ltr"
                  value={a.key}
                  pattern="[A-Za-z_][A-Za-z0-9_]{0,40}"
                  maxLength={41}
                  onChange={(e) => patch(i, { ...a, key: e.target.value })}
                />
                <datalist id={`${fieldListId}-${i}`}>
                  {fields.map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}
                    </option>
                  ))}
                </datalist>
              </label>
              <label>
                {t('القيمة (تدعم المتغيرات)', 'Value (supports variables)')}
                <input
                  value={a.value}
                  maxLength={2000}
                  onChange={(e) => patch(i, { ...a, value: e.target.value })}
                />
              </label>
            </>
          )}
          {a.type === 'tag' && (
            <>
              <label>
                {t('إضافة وسوم — افصل بفاصلة', 'Add labels — comma separated')}
                <TagInput values={a.add} onCommit={(add) => patch(i, { ...a, add })} />
              </label>
              <label>
                {t('إزالة وسوم', 'Remove labels')}
                <TagInput values={a.remove} onCommit={(remove) => patch(i, { ...a, remove })} />
              </label>
            </>
          )}
          {a.type === 'list' && (
            <>
              <label>
                {t('القائمة', 'List')}
                {pick(a.listId, lists, (id) => patch(i, { ...a, listId: id }))}
              </label>
              <label>
                {t('العملية', 'Operation')}
                <select
                  value={a.operation}
                  onChange={(e) =>
                    patch(i, { ...a, operation: e.target.value as 'add' | 'remove' })
                  }
                >
                  <option value="add">{t('إضافة', 'Add')}</option>
                  <option value="remove">{t('إزالة', 'Remove')}</option>
                </select>
              </label>
              <a href="/dashboard/crm/lists" target="_blank" rel="noopener noreferrer">
                {t('إدارة القوائم', 'Manage lists')}
              </a>
            </>
          )}
          {a.type === 'sequence' && (
            <>
              <label>
                {t('التسلسل', 'Sequence')}
                {pick(
                  a.sequenceId,
                  sequences.filter((s) => a.operation === 'unsubscribe' || s.status === 'active'),
                  (id) => patch(i, { ...a, sequenceId: id }),
                )}
              </label>
              <label>
                {t('العملية', 'Operation')}
                <select
                  value={a.operation}
                  onChange={(e) =>
                    patch(i, { ...a, operation: e.target.value as 'subscribe' | 'unsubscribe' })
                  }
                >
                  <option value="subscribe">{t('اشتراك', 'Subscribe')}</option>
                  <option value="unsubscribe">{t('إلغاء الاشتراك', 'Unsubscribe')}</option>
                </select>
              </label>
            </>
          )}
          {a.type === 'assign' && (
            <>
              <label>
                {t('القسم (اختياري)', 'Department (optional)')}
                {pick(a.departmentId, departments, (id) =>
                  patch(i, { ...a, departmentId: id || undefined, userId: undefined }),
                )}
              </label>
              <label>
                {t('الموظف (اختياري)', 'Employee (optional)')}
                {pick(
                  a.userId,
                  staff
                    .filter(
                      (s) =>
                        !a.departmentId ||
                        departments
                          .find((d) => d.id === a.departmentId)
                          ?.members.includes(s.user_id),
                    )
                    .map((s) => ({ id: s.user_id, name: s.full_name || s.email })),
                  (id) => patch(i, { ...a, userId: id || undefined }),
                )}
              </label>
            </>
          )}
          {a.type === 'webhook' && (
            <>
              <label>
                {t(
                  'رابط HTTPS — يتطلب إذن مالك البيانات',
                  'HTTPS URL — requires data owner authorization',
                )}
                <input
                  dir="ltr"
                  type="url"
                  value={a.url}
                  onChange={(e) => patch(i, { ...a, url: e.target.value })}
                />
              </label>
              <label>
                {t('محتوى الطلب (متغيرات اختيارية)', 'Request body (optional variables)')}
                <textarea
                  dir="ltr"
                  rows={4}
                  value={a.body}
                  maxLength={10000}
                  onChange={(e) => patch(i, { ...a, body: e.target.value })}
                />
              </label>
            </>
          )}
          <div className="form-actions">
            <button
              type="button"
              disabled={i === 0}
              onClick={() => {
                const next = [...value];
                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                onChange(next);
              }}
            >
              {t('لأعلى', 'Move up')}
            </button>
            <button
              type="button"
              disabled={i === value.length - 1}
              onClick={() => {
                const next = [...value];
                [next[i + 1], next[i]] = [next[i], next[i + 1]];
                onChange(next);
              }}
            >
              {t('لأسفل', 'Move down')}
            </button>
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              {t('إزالة الفعل', 'Remove action')}
            </button>
          </div>
        </fieldset>
      ))}
    </div>
  );
}
