'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { ConfigDisclosure, ConfigSummary } from './ConfigDisclosure';
import { useLocale } from '../product/locale';
import styles from './automation-config.module.css';
import { NavIcon } from '../product/NavIcon';

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
      <ConfigDisclosure>
        <ConfigSummary>{t('الإعدادات التقنية للربط', 'Advanced integration payload')}</ConfigSummary>
        <label>
          {t('بيانات العملية JSON', 'Operation JSON')}
          <textarea dir="ltr" rows={7} value={value} onChange={(e) => onChange(e.target.value)} />
        </label>
      </ConfigDisclosure>
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
    integration: t('تحديث جدول أو حجز موعد', 'Update a sheet or book an appointment'),
    set_field: t('حفظ حقل مخصص', 'Save custom field'),
    tag: t('إضافة / إزالة وسوم', 'Add / remove labels'),
    list: t('إضافة / إزالة من قائمة', 'Add / remove list membership'),
    sequence: t('اشتراك / إلغاء تسلسل', 'Subscribe / unsubscribe sequence'),
    assign: t('تحويل لموظف أو قسم', 'Assign employee or department'),
    webhook: t('إرسال البيانات لنظام خارجي', 'Send data to another system'),
  };
  const actionIcons: Record<ButtonAction['type'], string> = {
    integration: 'integrations',
    set_field: 'edit',
    tag: 'flag',
    list: 'crm',
    sequence: 'sequences',
    assign: 'team',
    webhook: 'globe',
  };
  const descriptions = {
    integration: t(
      'سجّل البيانات في جدول أو احجز موعدًا في التقويم.',
      'Write data to a sheet or book a calendar event.',
    ),
    set_field: t(
      'احفظ معلومة مثل المدينة في ملف العميل.',
      'Save a detail such as the city in the customer profile.',
    ),
    tag: t(
      'صنّف العميل بوسم مثل «مهتم بالعمرة».',
      'Label the customer, for example as interested in Umrah.',
    ),
    list: t(
      'أضف العميل إلى قائمة جمهور أو أزله منها.',
      'Add the customer to an audience list or remove them.',
    ),
    sequence: t(
      'ابدأ أو أوقف سلسلة رسائل مجدولة للعميل.',
      'Start or stop scheduled messages for this customer.',
    ),
    assign: t(
      'حوّل المحادثة إلى الموظف أو الفريق المسؤول.',
      'Hand the conversation to an employee or team.',
    ),
    webhook: t(
      'أرسل بيانات الاختيار إلى نظام خارجي مرتبط.',
      'Send the reply data to a connected external system.',
    ),
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
  const needsSetup = (a: ButtonAction) =>
    (a.type === 'integration' && !a.connectionId) ||
    (a.type === 'set_field' && !a.key.trim()) ||
    (a.type === 'tag' && !a.add.length && !a.remove.length) ||
    (a.type === 'list' && !a.listId) ||
    (a.type === 'sequence' && !a.sequenceId) ||
    (a.type === 'webhook' && !/^https:\/\/.+/.test(a.url));
  const summary = (a: ButtonAction) => {
    switch (a.type) {
      case 'set_field':
        return a.key ? `${fields.find((f) => f.key === a.key)?.label ?? a.key} · ${a.value || t('قيمة فارغة', 'Empty value')}` : t('اختر معلومة للحفظ', 'Choose a field to save');
      case 'tag':
        return [...a.add, ...a.remove].join('، ') || t('اختر الوسوم', 'Choose labels');
      case 'list':
        return lists.find((l) => l.id === a.listId)?.name ?? t('اختر القائمة', 'Choose a list');
      case 'sequence':
        return sequences.find((q) => q.id === a.sequenceId)?.name ?? t('اختر التسلسل', 'Choose a sequence');
      case 'assign':
        return staff.find((u) => u.user_id === a.userId)?.full_name ||
          departments.find((d) => d.id === a.departmentId)?.name ||
          t('حسب قواعد التوزيع الحالية', 'Using current routing rules');
      case 'integration':
        return connections.find((c) => c.id === a.connectionId)?.name ?? t('اختر الربط', 'Choose a connection');
      case 'webhook':
        return a.url === 'https://' ? t('أدخل رابط النظام', 'Enter the destination URL') : a.url;
    }
  };
  return (
    <div className={`${styles.form} ${styles.automationRoot}`}>
      <div className={styles.automationIntro}>
        <h3>{t('ماذا تريد أن يحدث تلقائيًا عندما يختار العميل هذا الرد؟', 'What should happen automatically when the customer chooses this reply?')}</h3>
        <p>{t('أضف إجراءً واحدًا أو أكثر. ستظهر تفاصيل كل إجراء عند فتحه، وتُنفذ الإجراءات بالترتيب الموضح.', 'Add one or more actions. Open an action to configure it; actions run in the order shown.')}</p>
      </div>
      {failed && (
        <p role="status">
          {t(
            'تعذر تحميل بعض قوائم الاختيار. القيم المحفوظة لم تتغير.',
            'Some selections could not load. Saved values are unchanged.',
          )}
        </p>
      )}
      {([
        { title: t('بيانات العميل وتصنيفه', 'Customer data and organization'), types: ['set_field', 'tag', 'list'], open: true },
        { title: t('المتابعة وتحويل المحادثة', 'Follow-up and conversation routing'), types: ['sequence', 'assign'], open: false },
        { title: t('الربط مع أنظمة أخرى', 'Connected systems'), types: ['integration', 'webhook'], open: false },
      ] as { title: string; types: ButtonAction['type'][]; open: boolean }[]).map((group) => (
        <ConfigDisclosure key={group.title} open={group.open}>
          <ConfigSummary>{group.title}</ConfigSummary>
          <div className={`${styles.grid} ${styles.actionGrid}`}>
            {group.types.map((type) => (
              <button
                type="button"
                className={`${styles.button} ${styles.actionChoice}`}
                key={type}
                aria-label={`${t('إضافة', 'Add')} ${labels[type]}`}
                disabled={value.length >= 20}
                onClick={() => add(type)}
              >
                <span className={styles.actionIcon}><NavIcon name={actionIcons[type]} /></span>
                <span className={styles.actionChoiceText}>
                  <strong>{labels[type]}</strong>
                  <small>{descriptions[type]}</small>
                </span>
                <span className={styles.addAction} aria-hidden="true">＋</span>
              </button>
            ))}
          </div>
          {group.types.includes('integration') && !connections.some((c) => c.enabled && c.provider !== 'webhook') && (
            <p className={styles.note}>
              {t('لتحديث الجداول أو التقويم، اربط حسابًا أولًا من إعدادات التكاملات.', 'To update sheets or calendars, connect an account in integration settings first.')}{' '}
              <a href="/dashboard/integrations" target="_blank" rel="noopener noreferrer">{t('إعداد الربط', 'Set up connection')}</a>
            </p>
          )}
          {group.types.includes('sequence') && !sequences.some((s) => s.status === 'active') && (
            <p className={styles.note}>{t('ابدأ بإنشاء تسلسل متابعة نشط قبل الاشتراك فيه.', 'Create an active follow-up sequence before subscribing a customer.')}</p>
          )}
        </ConfigDisclosure>
      ))}
      <div className={styles.actionListHeading}>
        <h3>{t('الإجراءات التي ستُنفذ بالترتيب', 'Actions in execution order')}</h3>
        <span>{value.length}/20</span>
      </div>
      {value.length === 0 && (
        <p className={styles.empty}>{t('لم تُضف إجراءات بعد. اختر إجراءً من المجموعات بالأعلى.', 'No actions added yet. Choose one of the actions above.')}</p>
      )}
      {value.map((a, i) => (
        <ConfigDisclosure key={i} className={styles.actionItem} open={i === value.length - 1}>
          <ConfigSummary>
            <span className={styles.actionSummary}>
              <span className={styles.actionOrder}>{i + 1}</span>
              <span className={styles.actionIcon}><NavIcon name={actionIcons[a.type]} /></span>
              <span className={styles.actionSummaryText}>
                <strong>{labels[a.type]}</strong>
                <small title={summary(a)}>{summary(a)}</small>
              </span>
              {needsSetup(a) && <span className={styles.needsSetup}>{t('يحتاج إعدادًا', 'Needs setup')}</span>}
            </span>
          </ConfigSummary>
          <div className={styles.actionContent}>
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
                {t('اختر معلومة موجودة عن العميل', 'Choose an existing customer field')}
                <select
                  value={fields.some((f) => f.key === a.key) ? a.key : ''}
                  onChange={(e) => patch(i, { ...a, key: e.target.value })}
                >
                  <option value="">{t('اختر الحقل', 'Choose a field')}</option>
                  {fields.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
                </select>
              </label>
              <ConfigDisclosure open={!!a.key && !fields.some((f) => f.key === a.key)}>
                <ConfigSummary>{t('اسم حقل جديد أو إعداد متقدم', 'New field name or advanced setting')}</ConfigSummary>
                <label>
                  {t('اسم الحقل التقني', 'Technical field key')}
                  <input
                    dir="ltr"
                    value={a.key}
                    pattern="[A-Za-z_][A-Za-z0-9_]{0,40}"
                    maxLength={41}
                    onChange={(e) => patch(i, { ...a, key: e.target.value })}
                  />
                </label>
              </ConfigDisclosure>
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
          <div className={styles.actionControls}>
            <button className={styles.orderButton}
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
              className={styles.orderButton}
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
            <button className={styles.removeButton} type="button" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <NavIcon name="trash" /> {t('إزالة الإجراء', 'Remove action')}
            </button>
          </div>
          </div>
        </ConfigDisclosure>
      ))}
    </div>
  );
}
