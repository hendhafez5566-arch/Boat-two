'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import DynamicCatalogSettings from './DynamicCatalogSettings';
import configStyles from './automation-config.module.css';
import NativeFlowNodeEditor from './NativeFlowNodeEditor';
import { useLocale } from '../product/locale';
import { nodeLabel, editorLabel } from './presentation';
import { api } from '../../lib/api';
import { ReactNode, createContext, useContext, useId, useEffect, useState } from 'react';
import { NodeType, uid } from '../../lib/flow-types';
import { STEP_GUIDANCE } from '../../lib/step-guidance';
import { ConfigDisclosure, ConfigSummary } from './ConfigDisclosure';
import MessageEditor, { EditorSection, ChatBubble } from './MessageEditor';
import ButtonActionsEditor from './ButtonActionsEditor';
import UserInputPreview, { UIQuestion } from './UserInputPreview';
import ConditionModal, {
  CondGroup,
  LabelOption,
  ConditionVariable,
  VariableRulePicker,
} from '../business/ConditionModal';

const FieldContext = createContext({ label: '', description: undefined as string | undefined });
const inp = 'w-full rounded border p-1.5 text-sm';

function F({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const { language } = useLocale();
  const hintId = useId();
  return (
    <fieldset className="mb-3 block min-w-0">
      <legend className="mb-1 block text-xs font-semibold text-gray-600">
        {editorLabel(label, language)}
      </legend>
      <FieldContext.Provider
        value={{ label: editorLabel(label, language), description: hint ? hintId : undefined }}
      >
        {children}
      </FieldContext.Provider>
      {hint && (
        <span id={hintId} className="mt-0.5 block text-xs text-gray-400">
          {editorLabel(hint, language)}
        </span>
      )}
    </fieldset>
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
}) => {
  const { language, t } = useLocale();
  const field = useContext(FieldContext);
  return (
    <textarea
      aria-label={ph ? editorLabel(ph, language) : field.label || t('نص', 'Text')}
      aria-describedby={field.description}
      className={inp}
      rows={rows}
      value={v ?? ''}
      placeholder={ph ? editorLabel(ph, language) : undefined}
      onChange={(e) => on(e.target.value)}
    />
  );
};
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
}) => {
  const { language, t } = useLocale();
  const field = useContext(FieldContext);
  return (
    <input
      aria-label={ph ? editorLabel(ph, language) : field.label || t('القيمة', 'Value')}
      aria-describedby={field.description}
      className={inp}
      value={v ?? ''}
      placeholder={ph ? editorLabel(ph, language) : undefined}
      dir={dir}
      onChange={(e) => on(e.target.value)}
    />
  );
};
const Sel = ({
  v,
  on,
  opts,
  localize = true,
}: {
  v?: string;
  on: (s: string) => void;
  opts: [string, string][];
  localize?: boolean;
}) => {
  const { language, t } = useLocale();
  const field = useContext(FieldContext);
  return (
    <select
      aria-label={field.label || t('الاختيار', 'Selection')}
      aria-describedby={field.description}
      className={inp}
      value={v}
      onChange={(e) => on(e.target.value)}
    >
      {opts.map(([k, l]) => (
        <option key={k} value={k}>
          {localize ? editorLabel(l, language) : l}
        </option>
      ))}
    </select>
  );
};
const Btn = ({
  on,
  children,
  danger,
}: {
  on: () => void;
  children: ReactNode;
  danger?: boolean;
}) => {
  const { language, t } = useLocale();
  const button = (
    <button
      aria-label={children === '×' ? t('حذف العنصر', 'Remove item') : undefined}
      type="button"
      onClick={() => {
        if (
          !danger ||
          confirm(
            t(
              'حذف هذا العنصر ووصلاته إن وجدت؟ يمكنك التراجع.',
              'Delete this item and any links? You can undo.',
            ),
          )
        )
          on();
      }}
      className={`rounded border px-2 py-1 text-xs ${danger ? 'text-red-600' : ''}`}
    >
      {typeof children === 'string' ? editorLabel(children.trim(), language) : children}
    </button>
  );
  return danger ? (
    <ConfigDisclosure className="smart-destructive-menu">
      <ConfigSummary aria-label={t('المزيد', 'More')}>⋯</ConfigSummary>
      {button}
    </ConfigDisclosure>
  ) : (
    button
  );
};

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

function AnswerDestination({
  value,
  onChange,
  variables,
}: {
  value?: string;
  onChange: (key: string) => void;
  variables: ConditionVariable[];
}) {
  const { t } = useLocale();
  const keys = variables.filter((v, i, all) => all.findIndex((x) => x.key === v.key) === i);
  return (
    <div className="smart-answer-destination">
      <label>
        {t('مكان حفظ الإجابة', 'Where to save the answer')}
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('اختر مكان الحفظ', 'Choose answer storage')}</option>
          {value && !keys.some((v) => v.key === value) && (
            <option value={value}>
              {t('الحقل الحالي', 'Current field')}: {value}
            </option>
          )}
          {keys.map((v) => (
            <option key={v.key} value={v.key}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      <ConfigDisclosure>
        <ConfigSummary>
          {t('اسم حقل جديد أو إعداد متقدم', 'New field name or advanced setting')}
        </ConfigSummary>
        <label>
          {t('اسم الحقل (إنجليزي وأرقام و _)', 'Field key (letters, numbers and _)')}
          <input dir="ltr" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
        </label>
      </ConfigDisclosure>
    </div>
  );
}

const COND_OPS: Record<string, [string, string]> = {
  equals: ['يساوي', 'equals'],
  not_equals: ['لا يساوي', 'does not equal'],
  contains: ['يحتوي', 'contains'],
  not_contains: ['لا يحتوي', 'does not contain'],
  starts_with: ['يبدأ بـ', 'starts with'],
  ends_with: ['ينتهي بـ', 'ends with'],
  greater_than: ['أكبر من', 'is greater than'],
  less_than: ['أصغر من', 'is less than'],
  is_set: ['موجود', 'is set'],
  is_not_set: ['غير موجود', 'is not set'],
  matches_regex: ['يطابق النمط', 'matches pattern'],
};
function condText(
  c: any,
  variables: { key: string; label: string }[],
  t: (ar: string, en: string) => string,
) {
  const field =
    c.source === 'variable'
      ? variables.find((v) => v.key === c.key)?.label ||
        c.key ||
        t('(اختر الحقل)', '(choose a field)')
      : c.source === 'last_message'
        ? t('آخر رسالة', 'Last message')
        : c.source === 'contact_field'
          ? ((
              {
                name: t('اسم العميل', 'Customer name'),
                phone: t('هاتف العميل', 'Customer phone'),
                email: t('بريد العميل', 'Customer email'),
              } as Record<string, string>
            )[c.key ?? 'name'] ?? c.key)
          : c.source === 'contact_attribute'
            ? c.key || t('(اختر الحقل)', '(choose a field)')
            : c.source === 'label'
              ? t('وسم العميل', 'Customer label')
              : t('القناة', 'Channel');
  const op = COND_OPS[c.operator]
    ? t(COND_OPS[c.operator][0], COND_OPS[c.operator][1])
    : c.operator;
  const noVal = c.operator === 'is_set' || c.operator === 'is_not_set';
  return `${field} ${op}${noVal ? '' : ` «${c.value || '…'}»`}`;
}
type AnswerKind =
  | 'choice'
  | 'text'
  | 'number'
  | 'email'
  | 'phone'
  | 'regex'
  | 'url'
  | 'date'
  | 'time'
  | 'datetime'
  | 'file'
  | 'image'
  | 'video';
function answerHint(kind: string, t: (ar: string, en: string) => string) {
  return (
    (
      {
        text: t('يقبل أي نص.', 'Accepts any text.'),
        number: t('يقبل أرقامًا فقط، مثل 25.', 'Accepts numbers only, e.g. 25.'),
        email: t(
          'يقبل بريدًا إلكترونيًا صحيحًا، مثل name@example.com.',
          'Accepts a valid email, e.g. name@example.com.',
        ),
        phone: t('يقبل رقم هاتف صحيحًا.', 'Accepts a valid phone number.'),
        url: t(
          'رابط كامل يبدأ بـ https:// أو http://.',
          'A full URL starting with https:// or http://.',
        ),
        date: t('تاريخ بصيغة YYYY-MM-DD، مثل 2026-12-25.', 'Date as YYYY-MM-DD, e.g. 2026-12-25.'),
        time: t('وقت بصيغة HH:mm، مثل 14:30.', 'Time as HH:mm, e.g. 14:30.'),
        datetime: t('تاريخ ووقت، مثل 2026-12-25T14:30.', 'Date and time, e.g. 2026-12-25T14:30.'),
        file: t('يتطلب إرسال ملف مرفق.', 'Requires an attached document.'),
        image: t('يتطلب إرسال صورة مرفقة.', 'Requires an attached image.'),
        video: t('يتطلب إرسال فيديو مرفق.', 'Requires an attached video.'),
        regex: t(
          'يقبل ما يطابق النمط الذي تكتبه (للمتقدمين).',
          'Accepts what matches your pattern (advanced).',
        ),
        choice: t(
          'يختار العميل من القائمة أو الأزرار.',
          'The customer picks from buttons or a list.',
        ),
      } as Record<string, string>
    )[kind] ?? ''
  );
}
function AnswerTypeSelector({
  value,
  onChange,
  kinds,
  t,
}: {
  value: string;
  onChange: (kind: string) => void;
  kinds: [AnswerKind, string, string][];
  t: (ar: string, en: string) => string;
}) {
  return (
    <label className="field">
      {t('نوع الرد', 'Reply Type')}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {kinds.map(([kind, ar, en]) => (
          <option key={kind} value={kind}>
            {t(ar, en)}
          </option>
        ))}
      </select>
    </label>
  );
}
export default function Inspector({
  type,
  data,
  onChange,
  variables: initialVariables = [],
  actionSummary,
  initialChoiceId,
  choiceView = false,
  onChoiceSelect,
  channelIds = [],
}: {
  channelIds?: string[];
  initialChoiceId?: string;
  choiceView?: boolean;
  onChoiceSelect?: (id: string | null) => void;
  actionSummary?: (handle: string) => string;
  variables?: ConditionVariable[];
  type: NodeType;
  data: any;
  onChange: (d: any) => void;
}) {
  const [contactFields, setContactFields] = useState<ConditionVariable[]>([]);
  useEffect(() => {
    let active = true;
    api<ConditionVariable[]>('/crm/fields')
      .then((rows) => {
        if (active) setContactFields(rows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const variables = [...initialVariables, ...contactFields].filter(
    (field, index, all) => all.findIndex((other) => other.key === field.key) === index,
  );
  const [googleConnections, setGoogleConnections] = useState<
    { id: string; provider: string; name: string; enabled: boolean }[]
  >([]);
  useEffect(() => {
    if (type === 'sheet_fetch')
      api<typeof googleConnections>('/integrations')
        .then((rows) =>
          setGoogleConnections(rows.filter((r) => r.provider === 'google' && r.enabled)),
        )
        .catch(() => {});
  }, [type]);
  const [products, setProducts] = useState<{ id: string; name: string; archived: boolean }[]>([]);
  const [appointmentServices, setAppointmentServices] = useState<
    { id: string; name: string; enabled: boolean }[]
  >([]);
  useEffect(() => {
    if (['product', 'catalog'].includes(type))
      api<typeof products>('/commerce/products')
        .then(setProducts)
        .catch(() => {});
    if (type === 'appointment')
      api<typeof appointmentServices>('/commerce/services')
        .then(setAppointmentServices)
        .catch(() => {});
  }, [type]);
  const [staff, setStaff] = useState<
    { user_id: string; full_name: string; email: string; available: boolean }[]
  >([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (type === 'handoff')
      api<typeof departments>('/departments')
        .then(setDepartments)
        .catch(() => {});
  }, [type]);
  const [staffState, setStaffState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    if (type !== 'handoff') return;
    let active = true;
    api<{ members: typeof staff }>('/team')
      .then((result) => {
        if (active) {
          setStaff(result.members ?? []);
          setStaffState('ready');
        }
      })
      .catch(() => {
        if (active) setStaffState('error');
      });
    return () => {
      active = false;
    };
  }, [type]);
  const [sequences, setSequences] = useState<{ id: string; name: string; status: string }[]>([]);
  useEffect(() => {
    if (type === 'sequence')
      api<typeof sequences>('/sequences')
        .then(setSequences)
        .catch(() => {});
  }, [type]);
  const [components, setComponents] = useState<
    { id: string; name: string; is_component: boolean; status: string }[]
  >([]);
  useEffect(() => {
    if (type === 'subflow')
      api<typeof components>('/flows')
        .then(setComponents)
        .catch(() => {});
  }, [type]);
  const [labels, setLabels] = useState<LabelOption[]>([]);
  useEffect(() => {
    if (type === 'condition' || type === 'tag')
      api<LabelOption[]>('/labels')
        .then(setLabels)
        .catch(() => {});
  }, [type]);
  const [drilling, setDrilling] = useState(!!initialChoiceId);
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
  const [condRule, setCondRule] = useState<number | null>(null);
  const set = (patch: any) => onChange({ ...data, ...patch });
  const { language, t } = useLocale();

  return (
    <div
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      className={`flow-inspector-content ${configStyles.form}`}
    >
      {type !== 'message' && type !== 'interactive' && (
        <p className="smart-step-intro">{t(...STEP_GUIDANCE[type])}</p>
      )}
      {type === 'subflow' && (
        <F label="المكوّن المنشور" hint="تُثبت نسخة المكوّن عند نشر البوت الرئيسي.">
          <Sel
            localize={false}
            v={data.flowId}
            on={(flowId) => set({ flowId })}
            opts={[
              ['', t('اختر مكوّنًا', 'Choose a component')],
              ...components
                .filter((c) => c.is_component && c.status === 'published')
                .map((c) => [c.id, c.name] as [string, string]),
            ]}
          />
        </F>
      )}
      {['product', 'catalog'].includes(type) && (
        <EditorSection title={t('منتجات الكتالوج', 'Catalog products')}>
          {type === 'catalog' && <DynamicCatalogSettings data={data} set={set} />}
          {!data.sourceId && (
            <>
              <label>
                {t('اختر المنتج أو صفوف القسم', 'Choose product or section rows')}
                <select
                  multiple={type === 'catalog'}
                  value={type === 'catalog' ? (data.productIds ?? []) : (data.productId ?? '')}
                  onChange={(e) =>
                    set(
                      type === 'catalog'
                        ? { productIds: Array.from(e.target.selectedOptions).map((o) => o.value) }
                        : { productId: e.target.value },
                    )
                  }
                >
                  <option value="" disabled>
                    {t('اختر', 'Choose')}
                  </option>
                  {products
                    .filter((p) => !p.archived)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              {type === 'catalog' && (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={!!data.selectable}
                      disabled={!!data.native}
                      onChange={(e) => set({ selectable: e.target.checked })}
                    />
                    {t(
                      'انتظار اختيار منتج من قائمة (10 منتجات كحد أقصى)',
                      'Wait for a product selection from list rows (up to 10 products)',
                    )}
                  </label>
                  {data.selectable && (
                    <label>
                      {t('حفظ معرف المنتج في متغير', 'Save product ID to variable')}
                      <input
                        value={data.saveAs ?? 'selectedProductId'}
                        onChange={(e) => set({ saveAs: e.target.value })}
                      />
                    </label>
                  )}
                </>
              )}
              {type === 'catalog' && (
                <F label={t('نص الكتالوج', 'Catalog message')}>
                  <Txt v={data.text} on={(text) => set({ text })} />
                </F>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={!!data.native}
                  onChange={(e) =>
                    set({
                      native: e.target.checked,
                      ...(e.target.checked ? { selectable: false } : {}),
                    })
                  }
                />
                {t(
                  'كتالوج WhatsApp أصلي (يتطلب اعتماد المزود ومعرفاته)',
                  'Native WhatsApp catalog (requires approved provider IDs)',
                )}
              </label>
            </>
          )}
          {data.sourceId && (
            <F label={t('نص الكتالوج', 'Catalog message')}>
              <Txt v={data.text} on={(text) => set({ text })} />
            </F>
          )}
          <a href="/dashboard/commerce" target="_blank" rel="noopener noreferrer">
            {t('إدارة المنتجات والأسعار', 'Manage products and prices')}
          </a>
        </EditorSection>
      )}
      {type === 'appointment' && (
        <EditorSection title={t('حجز حقيقي دون ازدواج', 'Book an available appointment')}>
          <label>
            {t('الخدمة', 'Service')}
            <select
              value={data.serviceId ?? ''}
              onChange={(e) => set({ serviceId: e.target.value })}
            >
              <option value="">{t('اختر', 'Choose')}</option>
              {appointmentServices
                .filter((s) => s.enabled)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          <F
            label={t(
              'وقت البدء ISO مع المنطقة الزمنية أو متغير',
              'ISO start time with timezone or variable',
            )}
          >
            <In v={data.start} on={(start) => set({ start })} />
          </F>
          <AnswerDestination
            value={data.saveAs}
            onChange={(saveAs) => set({ saveAs })}
            variables={variables}
          />
          <a href="/dashboard/commerce">{t('إدارة المواعيد', 'Manage appointments')}</a>
        </EditorSection>
      )}
      {type === 'whatsapp_flow' && (
        <EditorSection title="WhatsApp Flow">
          <NativeFlowNodeEditor data={data} set={set} channelIds={channelIds} />
        </EditorSection>
      )}
      {(type === 'message' || type === 'interactive') && (
        <MessageEditor
          view={choiceView ? 'choices' : 'message'}
          interactive={type === 'interactive'}
          onChoiceSelect={onChoiceSelect}
          initialChoiceId={initialChoiceId}
          data={data}
          onChange={onChange}
          variables={variables}
          actionSummary={actionSummary}
          onDrillChange={setDrilling}
        />
      )}
      <div hidden={drilling}>
        {type !== 'message' && type !== 'interactive' && (
          <h2 className="smart-core-title">
            {type === 'condition'
              ? t('متى يسلك العميل هذا المسار؟', 'When should the customer take this path?')
              : type === 'handoff'
                ? t('تحويل إلى موظف', 'Transfer to staff')
                : nodeLabel(type, language)}
          </h2>
        )}
        {type === 'location' && (
          <>
            <F
              label={t('خط العرض (Latitude)', 'Latitude')}
              hint={t('يمكن استخدام متغيّر مثل {{lat}}', 'Variables like {{lat}} allowed')}
            >
              <In v={data.lat} on={(v) => set({ lat: v })} ph="30.0444" dir="ltr" />
            </F>
            <F label={t('خط الطول (Longitude)', 'Longitude')}>
              <In v={data.lng} on={(v) => set({ lng: v })} ph="31.2357" dir="ltr" />
            </F>
            <F label={t('اسم المكان', 'Place name')}>
              <In v={data.name} on={(v) => set({ name: v })} />
            </F>
            <F label={t('العنوان', 'Address')}>
              <In v={data.address} on={(v) => set({ address: v })} />
            </F>
          </>
        )}

        {type === 'cta_url' && (
          <>
            <F label={t('نص الرسالة', 'Message text')}>
              <Txt v={data.text} on={(v) => set({ text: v })} />
            </F>
            <F label={t('صورة الهيدر (رابط HTTPS، اختياري)', 'Header image (HTTPS URL, optional)')}>
              <In v={data.imageUrl} on={(v) => set({ imageUrl: v })} dir="ltr" />
            </F>
            <F label={t('نص الزر', 'Button label')} hint={t('حتى 20 حرفًا', 'Up to 20 characters')}>
              <In v={data.buttonText} on={(v) => set({ buttonText: v.slice(0, 20) })} />
            </F>
            <F
              label={t('الرابط', 'URL')}
              hint={t(
                'على ماسنجر وإنستجرام يُرسل الرابط كنص.',
                'On Messenger and Instagram the link is sent as text.',
              )}
            >
              <In v={data.url} on={(v) => set({ url: v })} dir="ltr" />
            </F>
          </>
        )}

        {type === 'sequence' && (
          <F
            label={t('التسلسل', 'Sequence')}
            hint={t(
              'يُضاف العميل فقط لو وافق على الرسائل التسويقية، وإلا يكمل الـ flow بدون إضافة.',
              'The contact is added only if opted in to marketing; otherwise the flow continues.',
            )}
          >
            <Sel
              v={data.sequenceId}
              on={(v) => set({ sequenceId: v })}
              opts={[
                ['', t('اختر تسلسلًا', 'Choose a sequence')],
                ...sequences.map((s): [string, string] => [s.id, `${s.name} (${s.status})`]),
              ]}
              localize={false}
            />
          </F>
        )}

        {type === 'template' && (
          <>
            <F
              label={t('اسم القالب المعتمد', 'Approved template name')}
              hint={t(
                'حروف إنجليزية صغيرة وأرقام و _ فقط. يعمل على واتساب فقط.',
                'Lowercase letters, digits and _ only. WhatsApp only.',
              )}
            >
              <In v={data.name} on={(v) => set({ name: v })} dir="ltr" />
            </F>
            <F label={t('اللغة', 'Language')}>
              <In v={data.language} on={(v) => set({ language: v })} ph="ar" dir="ltr" />
            </F>
            <F label={t('متغيّرات النص (واحد في كل سطر)', 'Body variables (one per line)')}>
              <Txt
                v={(data.bodyParams ?? []).join('\n')}
                on={(v) => set({ bodyParams: v.split('\n').filter((x) => x.trim()) })}
              />
            </F>
          </>
        )}

        {type === 'question' && (
          <>
            <EditorSection
              title={t('١ — السؤال الذي سيراه العميل', '1 — The question your customer sees')}
            >
              <F label={t('نص السؤال', 'Question text')}>
                <Txt v={data.text} on={(text) => set({ text })} />
              </F>
              <ChatBubble text={data.text} />
            </EditorSection>
            <EditorSection title={t('٢ — نوع الإجابة', '2 — Answer type')}>
              <AnswerTypeSelector
                t={t}
                value={data.answerType ?? 'text'}
                onChange={(answerType) => set({ answerType })}
                kinds={[
                  ['text', 'نص', 'Text'],
                  ['number', 'رقم', 'Number'],
                  ['phone', 'هاتف', 'Phone'],
                  ['email', 'إيميل', 'Email'],
                  ['url', 'رابط', 'URL'],
                  ['file', 'ملف', 'File'],
                  ['image', 'صورة', 'Image'],
                  ['video', 'فيديو', 'Video'],
                  ['date', 'تاريخ', 'Date'],
                  ['time', 'وقت', 'Time'],
                  ['datetime', 'تاريخ ووقت', 'Datetime'],
                  ['regex', 'نمط مخصص', 'Custom pattern'],
                ]}
              />
              <p className="qa-hint">{answerHint(data.answerType ?? 'text', t)}</p>
              {data.answerType === 'regex' && (
                <F label={t('النمط (Regex)', 'Pattern (Regex)')}>
                  <In v={data.pattern} on={(pattern) => set({ pattern })} dir="ltr" />
                </F>
              )}
            </EditorSection>
            <EditorSection title={t('٣ — أين تُحفظ الإجابة؟', '3 — Where is the answer saved?')}>
              <AnswerDestination
                value={data.saveAs}
                onChange={(saveAs) => set({ saveAs })}
                variables={variables}
              />
              <label>
                {t('حفظ في حقل نظام (اختياري)', 'Save to a system field (optional)')}
                <select
                  value={data.saveToSystem ?? ''}
                  onChange={(e) =>
                    set({ saveToSystem: e.target.value || undefined, saveToContact: false })
                  }
                >
                  <option value="">{t('متغير/حقل مخصص', 'Variable / custom field')}</option>
                  {['name', 'email', 'phone'].map((v) => (
                    <option key={v} value={v}>
                      {
                        (
                          {
                            name: t('اسم العميل', 'Customer name'),
                            email: t('بريد العميل', 'Customer email'),
                            phone: t('هاتف العميل', 'Customer phone'),
                          } as Record<string, string>
                        )[v]
                      }{' '}
                      ({v})
                    </option>
                  ))}
                </select>
              </label>
            </EditorSection>
            <EditorSection
              title={t('٤ — لو كانت الإجابة غير صحيحة', '4 — If the answer is invalid')}
            >
              <p className="qa-hint">
                {t(
                  'يُعاد السؤال تلقائيًا. اكتب رسالة توضح للعميل الصيغة المطلوبة.',
                  'The question is asked again. Write a message that explains the expected format.',
                )}
              </p>
              <F
                label={t('رسالة الخطأ (اختياري)', 'Error message (optional)')}
                hint={t(
                  'لو تُركت فارغة يُعاد السؤال نفسه',
                  'If empty, the same question is repeated',
                )}
              >
                <Txt
                  v={data.errorText}
                  on={(errorText) => set({ errorText: errorText || undefined })}
                  rows={2}
                />
              </F>
              <div
                className="qa-error-preview"
                aria-label={t('معاينة رسالة الخطأ', 'Error message preview')}
              >
                <small>{t('معاينة الخطأ', 'Error preview')}</small>
                <div>
                  {data.errorText ||
                    data.text ||
                    t('(يُعاد نص السؤال)', '(the question text is repeated)')}
                </div>
              </div>
            </EditorSection>
            <ConfigDisclosure className="mt-3">
              <ConfigSummary>{t('خيارات متقدمة', 'Advanced options')}</ConfigSummary>
              <F label={t('عدد المحاولات عند الإجابة الخاطئة', 'Retries after an invalid answer')}>
                <In
                  v={data.retries ?? 2}
                  on={(n) => set({ retries: Math.max(0, Math.min(5, Number(n) || 0)) })}
                />
              </F>
              <label>
                <input
                  type="checkbox"
                  checked={!!data.saveToContact}
                  onChange={(e) => set({ saveToContact: e.target.checked })}
                />{' '}
                {t(
                  'احفظ الإجابة أيضًا كحقل مخصص للعميل',
                  'Also save the answer as a custom contact field',
                )}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!!data.allowSkip}
                  onChange={(e) => set({ allowSkip: e.target.checked })}
                />{' '}
                {t(
                  'السماح بتخطي السؤال دون تغيير الحقل',
                  'Allow skipping without changing the saved field',
                )}
              </label>
              {data.allowSkip && (
                <F label={t('نص التخطي', 'Skip label')}>
                  <In
                    v={data.skipText || '/skip'}
                    on={(skipText) => set({ skipText: skipText.slice(0, 20) || undefined })}
                  />
                </F>
              )}
            </ConfigDisclosure>
          </>
        )}

        {type === 'condition' && (
          <>
            {data.rules.map((r: any, ri: number) => (
              <div key={r.id} className="cd-rule">
                <div className="cd-rule-head">
                  <strong>
                    {t('المسار', 'Path')} {ri + 1}: {t('إذا تحقق', 'If')}
                  </strong>
                  <Btn
                    danger
                    on={() => set({ rules: data.rules.filter((_: any, j: number) => j !== ri) })}
                  >
                    ×
                  </Btn>
                </div>
                {r.conditions.length > 1 && (
                  <div
                    className="qa-types"
                    role="radiogroup"
                    aria-label={t('طريقة المطابقة', 'Match mode')}
                  >
                    {(
                      [
                        ['all', 'كل الشروط (و)', 'All (AND)'],
                        ['any', 'أي شرط (أو)', 'Any (OR)'],
                      ] as const
                    ).map(([m, ar, en]) => (
                      <button
                        type="button"
                        key={m}
                        role="radio"
                        aria-checked={(r.match ?? 'all') === m}
                        className={(r.match ?? 'all') === m ? 'is-on' : ''}
                        onClick={() =>
                          set({
                            rules: data.rules.map((x: any, j: number) =>
                              j === ri ? { ...x, match: m } : x,
                            ),
                          })
                        }
                      >
                        {t(ar, en)}
                      </button>
                    ))}
                  </div>
                )}
                <p className="cd-summary">
                  {r.conditions
                    .map((c: any) => condText(c, variables, t))
                    .join(` ${(r.match ?? 'all') === 'any' ? t('أو', 'OR') : t('و', 'AND')} `) ||
                    t('أضف شرطًا', 'Add a condition')}
                </p>
                <p className="cd-dest">
                  <span>{t('نعم ←', 'Yes →')}</span>{' '}
                  {actionSummary?.(`rule:${r.id}`) ?? t('لا توجد وجهة بعد', 'No destination yet')}
                </p>
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
                    <div key={ci} className="cd-cond">
                      {ci > 0 && (
                        <span className="cd-connector">
                          {(r.match ?? 'all') === 'any' ? t('أو', 'OR') : t('و', 'AND')}
                        </span>
                      )}
                      <Sel
                        v={c.source}
                        on={(source) => upd({ source })}
                        opts={[
                          ['variable', 'متغيّر'],
                          ['last_message', 'آخر رسالة'],
                          ['contact_field', 'حقل العميل (name/phone/email)'],
                          ['contact_attribute', 'بيان مخصص للعميل'],
                          ['label', 'وسم العميل (Label)'],
                          ['channel', 'القناة'],
                        ]}
                      />
                      {c.source === 'variable' && (
                        <VariableRulePicker rule={c} variables={variables} onChange={upd} />
                      )}
                      {['variable', 'contact_field', 'contact_attribute'].includes(c.source) &&
                        (c.source === 'contact_field' ? (
                          <Sel
                            v={c.key ?? 'name'}
                            on={(key) => upd({ key })}
                            opts={[
                              ['name', 'الاسم'],
                              ['phone', 'الهاتف'],
                              ['email', 'البريد'],
                            ]}
                          />
                        ) : (
                          <ConfigDisclosure>
                            <ConfigSummary>
                              {t('اسم الحقل المتقدم', 'Advanced field key')}
                            </ConfigSummary>
                            <In v={c.key} on={(key) => upd({ key })} ph="الاسم" dir="ltr" />
                          </ConfigDisclosure>
                        ))}
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
                          {t('حذف الشرط', 'Delete condition')}
                        </Btn>
                      )}
                    </div>
                  );
                })}
                <ConfigDisclosure className="mt-3">
                  <ConfigSummary>{t('خيارات متقدمة', 'Advanced options')}</ConfigSummary>
                  <Btn on={() => setCondRule(ri)}>
                    {t('فتح شاشة الشرط الكاملة', 'Open full rule editor')}
                  </Btn>
                </ConfigDisclosure>
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
                  + {t('إضافة شرط', 'Add condition')}
                </Btn>
              </div>
            ))}
            <ConditionModal
              variables={variables}
              open={condRule !== null}
              value={
                condRule !== null && data.rules[condRule]
                  ? {
                      match: data.rules[condRule].match ?? 'all',
                      conditions: data.rules[condRule].conditions,
                    }
                  : undefined
              }
              labels={labels}
              onClose={() => setCondRule(null)}
              onSave={(v: CondGroup | undefined) => {
                if (condRule !== null && v)
                  set({
                    rules: data.rules.map((x: any, j: number) =>
                      j === condRule ? { ...x, match: v.match, conditions: v.conditions } : x,
                    ),
                  });
                setCondRule(null);
              }}
            />
            {data.rules.length < 15 && (
              <Btn
                on={() =>
                  set({
                    rules: [
                      ...data.rules,
                      {
                        id: uid(),
                        match: 'all',
                        conditions: [
                          { source: 'variable', key: '', operator: 'equals', value: '' },
                        ],
                      },
                    ],
                  })
                }
              >
                + {t('مسار شرط جديد', 'New condition path')}
              </Btn>
            )}
            <div className="cd-rule cd-else">
              <strong>{t('وإلا (لا يتحقق أي مسار)', 'Otherwise (no path matches)')}</strong>
              <p className="cd-dest">
                <span>{t('لا ←', 'No →')}</span>{' '}
                {actionSummary?.('else') ?? t('لا توجد وجهة بعد', 'No destination yet')}
              </p>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              {t(
                'تُفحص المجموعات بالترتيب، وأول مجموعة تتحقق هي التي تُتبع.',
                'Groups are checked in order; the first matching group runs.',
              )}
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
                set({
                  assignments: [...data.assignments, { name: '', operation: 'set', value: '' }],
                })
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

        {type === 'tag' && (
          <>
            <F label="إضافة وسوم" hint="افصل بين الوسوم بفاصلة. يمكن استخدام المتغيّرات.">
              <In
                v={(data.add ?? []).join(', ')}
                on={(v) =>
                  set({
                    add: v
                      .split(',')
                      .map((x: string) => x.trim())
                      .filter(Boolean),
                  })
                }
              />
            </F>
            {labels.length > 0 && (
              <div
                className="mb-3 flex flex-wrap gap-1"
                aria-label={t('وسوم موجودة', 'Existing labels')}
              >
                {labels.slice(0, 20).map((l) => (
                  <button
                    key={l.label}
                    type="button"
                    className="rounded-full border px-2 py-0.5 text-xs"
                    disabled={(data.add ?? []).includes(l.label)}
                    onClick={() => set({ add: [...(data.add ?? []), l.label] })}
                  >
                    + {l.label}
                  </button>
                ))}
              </div>
            )}
            <F label="إزالة وسوم">
              <In
                v={(data.remove ?? []).join(', ')}
                on={(v) =>
                  set({
                    remove: v
                      .split(',')
                      .map((x: string) => x.trim())
                      .filter(Boolean),
                  })
                }
              />
            </F>
          </>
        )}

        {['image', 'audio', 'video', 'file'].includes(type) && (
          <>
            <F
              label={t('رابط الملف', 'Media URL')}
              hint={t(
                'رابط مباشر يبدأ بـ https. يمكن استخدام المتغيّرات.',
                'Direct https link. Variables are allowed.',
              )}
            >
              <In v={data.url} on={(url) => set({ url })} ph="https://…" dir="ltr" />
            </F>
            {type !== 'audio' && (
              <F label={t('تعليق', 'Caption')}>
                <Txt v={data.caption} on={(caption) => set({ caption })} rows={2} />
              </F>
            )}
            {type === 'file' && (
              <F label={t('اسم الملف', 'File name')}>
                <In v={data.filename} on={(filename) => set({ filename })} dir="ltr" />
              </F>
            )}
            {type === 'audio' && (
              <p className="text-xs text-gray-400">
                {t(
                  'الصوت لا يدعم تعليقًا على واتساب.',
                  'WhatsApp audio does not support captions.',
                )}
              </p>
            )}
          </>
        )}

        {type === 'user_input' && (
          <>
            <F label={t('اسم الحملة', 'Campaign name')}>
              <In v={data.name} on={(name) => set({ name })} />
            </F>
            {(data.questions as UIQuestion[]).map((q, qi, all) => {
              const upq = (patch: Partial<UIQuestion>) =>
                set({ questions: all.map((x, k) => (k === qi ? { ...x, ...patch } : x)) });
              return (
                <div key={q.id} className="mb-3 rounded border p-2">
                  <button
                    type="button"
                    className="smart-question-heading"
                    aria-expanded={(activeQuestion ?? all[0]?.id) === q.id}
                    onClick={() => setActiveQuestion(q.id)}
                  >
                    {qi + 1}. {q.text || t('سؤال جديد', 'New question')}
                  </button>
                  {(activeQuestion ?? all[0]?.id) === q.id && (
                    <>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <strong>
                          {t('سؤال', 'Question')} {qi + 1}
                        </strong>
                        <span className="flex gap-1">
                          <Btn
                            on={() =>
                              qi > 0 &&
                              set({
                                questions: all.map((x, k) =>
                                  k === qi - 1 ? all[qi] : k === qi ? all[qi - 1] : x,
                                ),
                              })
                            }
                          >
                            ↑
                          </Btn>
                          <Btn
                            on={() =>
                              qi < all.length - 1 &&
                              set({
                                questions: all.map((x, k) =>
                                  k === qi + 1 ? all[qi] : k === qi ? all[qi + 1] : x,
                                ),
                              })
                            }
                          >
                            ↓
                          </Btn>
                          <Btn
                            danger
                            on={() => {
                              set({ questions: all.filter((_, k) => k !== qi) });
                              setActiveQuestion(null);
                            }}
                          >
                            ×
                          </Btn>
                        </span>
                      </div>
                      <F label={t('نص السؤال', 'Question text')}>
                        <Txt v={q.text} on={(text) => upq({ text })} rows={3} />
                      </F>
                      <ChatBubble
                        text={q.text}
                        choices={
                          q.kind === 'choice' ? (q.options ?? []).map((o) => o.title) : undefined
                        }
                        list={(q.options ?? []).length > 3}
                      />
                      <p className="qa-label">{t('نوع الإجابة', 'Answer type')}</p>
                      <AnswerTypeSelector
                        t={t}
                        value={q.kind}
                        kinds={[
                          ['text', 'نص', 'Text'],
                          ['number', 'رقم', 'Number'],
                          ['phone', 'هاتف', 'Phone'],
                          ['email', 'إيميل', 'Email'],
                          ['url', 'رابط', 'URL'],
                          ['file', 'ملف', 'File'],
                          ['image', 'صورة', 'Image'],
                          ['video', 'فيديو', 'Video'],
                          ['date', 'تاريخ', 'Date'],
                          ['time', 'وقت', 'Time'],
                          ['datetime', 'تاريخ ووقت', 'Datetime'],
                          ['choice', 'اختيار', 'Choice'],
                        ]}
                        onChange={(kind) =>
                          upq({
                            kind: kind as UIQuestion['kind'],
                            options:
                              kind === 'choice' && !(q.options ?? []).length
                                ? [
                                    { id: uid(), title: '' },
                                    { id: uid(), title: '' },
                                  ]
                                : q.options,
                          })
                        }
                      />
                      <p className="qa-hint">{answerHint(q.kind, t)}</p>
                      {q.kind === 'choice' && (
                        <F
                          label={t('الاختيارات', 'Options')}
                          hint={t(
                            'حتى 3 اختيارات تظهر كأزرار، ومن 4 إلى 10 تظهر كقائمة. الحد 24 حرف.',
                            'Up to 3 show as buttons, 4–10 as a list. Max 24 characters.',
                          )}
                        >
                          {(q.options ?? []).map((o, oi) => (
                            <div key={o.id} className="mb-1 flex gap-1">
                              <In
                                v={o.title}
                                on={(title) =>
                                  upq({
                                    options: (q.options ?? []).map((x, k) =>
                                      k === oi ? { ...x, title: title.slice(0, 24) } : x,
                                    ),
                                  })
                                }
                                ph={`${t('اختيار', 'Option')} ${oi + 1}`}
                              />
                              <Btn
                                danger
                                on={() =>
                                  upq({ options: (q.options ?? []).filter((_, k) => k !== oi) })
                                }
                              >
                                ×
                              </Btn>
                            </div>
                          ))}
                          {(q.options ?? []).length < 10 && (
                            <Btn
                              on={() =>
                                upq({ options: [...(q.options ?? []), { id: uid(), title: '' }] })
                              }
                            >
                              {t('+ اختيار', '+ Option')}
                            </Btn>
                          )}
                        </F>
                      )}
                      <AnswerDestination
                        value={q.saveAs}
                        onChange={(saveAs) => upq({ saveAs })}
                        variables={variables}
                      />
                      <label>
                        {t(
                          'وجهة النظام (فارغة للحقل المخصص)',
                          'System destination (empty for custom field)',
                        )}
                        <select
                          value={q.saveToSystem ?? ''}
                          onChange={(e) =>
                            upq({
                              saveToSystem: (e.target.value || undefined) as
                                'name' | 'email' | 'phone' | undefined,
                            })
                          }
                        >
                          <option value="">{t('حقل مخصص', 'Custom field')}</option>
                          {['name', 'email', 'phone'].map((v) => (
                            <option key={v} value={v}>
                              {
                                (
                                  {
                                    name: t('اسم العميل', 'Customer name'),
                                    email: t('بريد العميل', 'Customer email'),
                                    phone: t('هاتف العميل', 'Customer phone'),
                                  } as Record<string, string>
                                )[v]
                              }{' '}
                              ({v})
                            </option>
                          ))}
                        </select>
                      </label>
                      {q.kind !== 'choice' && (
                        <F
                          label={t(
                            'رسالة الخطأ عند إجابة غير صحيحة',
                            'Error message for an invalid answer',
                          )}
                          hint={t(
                            'لو تُركت فارغة يُعاد السؤال نفسه',
                            'If empty, the same question is repeated',
                          )}
                        >
                          <In v={q.errorText} on={(errorText) => upq({ errorText })} />
                        </F>
                      )}
                      <ConfigDisclosure className="mt-3">
                        <ConfigSummary>{t('خيارات متقدمة', 'Advanced options')}</ConfigSummary>
                        <label>
                          <input
                            type="checkbox"
                            checked={!!q.allowSkip}
                            onChange={(e) => upq({ allowSkip: e.target.checked })}
                          />{' '}
                          {t('السماح بالتخطي', 'Allow skipping')}
                        </label>
                        {q.allowSkip && (
                          <F label={t('نص التخطي', 'Skip label')}>
                            <In
                              v={q.skipText || '/skip'}
                              on={(skipText) =>
                                upq({ skipText: skipText.slice(0, 20) || undefined })
                              }
                            />
                          </F>
                        )}
                      </ConfigDisclosure>
                    </>
                  )}
                </div>
              );
            })}
            {data.questions.length < 20 && (
              <Btn
                on={() =>
                  set({
                    questions: [
                      ...data.questions,
                      {
                        id: uid(),
                        text: '',
                        kind: 'text',
                        saveAs: `field_${data.questions.length + 1}`,
                      },
                    ],
                  })
                }
              >
                {t('+ سؤال', '+ Question')}
              </Btn>
            )}
            <F
              label={t('رسالة الشكر بعد آخر سؤال', 'Thank-you message after the last question')}
              hint={t(
                'يمكن استخدام {{اسم_الحقل}} و {{contact.name}}.',
                'You can use {{field_key}} and {{contact.name}}.',
              )}
            >
              <Txt v={data.doneText} on={(doneText) => set({ doneText })} rows={3} />
            </F>
            <p className="mb-1 mt-3 text-xs font-semibold text-gray-600">
              {t('معاينة السلسلة', 'Chain preview')}
            </p>
            <ButtonActionsEditor
              value={data.completionActions}
              onChange={(completionActions) => set({ completionActions })}
            />
            <UserInputPreview
              name={data.name}
              questions={data.questions}
              doneText={data.doneText}
            />
          </>
        )}

        {type === 'note' && (
          <F label="نص الملاحظة" hint="تُحفظ في ملف العميل ولا تظهر له.">
            <In v={data.body} on={(body) => set({ body })} />
          </F>
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
              {t(
                'على واتساب: الرد الحر مسموح خلال 24 ساعة من آخر رسالة للعميل فقط.',
                'WhatsApp allows free-form replies only within 24 hours of the last customer message.',
              )}
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
            <ConfigDisclosure>
              <ConfigSummary>
                {t('إعدادات الطلب المتقدمة', 'Advanced request settings')}
              </ConfigSummary>
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
                      on={() =>
                        set({ headers: data.headers.filter((_: any, j: number) => j !== i) })
                      }
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
            </ConfigDisclosure>
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

        {type === 'sheet_fetch' && (
          <>
            <label>
              {t('الحساب الخاص (فارغ للرابط العام)', 'Private account (empty for public link)')}
              <select
                value={data.connectionId ?? ''}
                onChange={(e) => set({ connectionId: e.target.value || undefined })}
              >
                <option value="">{t('رابط عام', 'Public link')}</option>
                {googleConnections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {!data.connectionId && (
              <p role="note">
                {t(
                  'تنبيه خصوصية: الرابط العام يكشف بيانات الشيت لمن يمتلكه. لا تستخدمه لبيانات العملاء أو المعلومات السرية؛ استخدم ربط Google الخاص.',
                  'Privacy: a public link exposes sheet data to anyone holding it. Use private Google authorization for customer or confidential data.',
                )}
              </p>
            )}
            {data.connectionId && (
              <>
                <F label={t('معرف الشيت', 'Spreadsheet ID')}>
                  <In v={data.spreadsheetId} on={(spreadsheetId) => set({ spreadsheetId })} />
                </F>
                <F label={t('النطاق', 'Range')}>
                  <In v={data.range || 'A:ZZ'} on={(range) => set({ range })} />
                </F>
              </>
            )}
            <F
              label="رابط الشيت"
              hint="الشيت لازم يكون متاح لأي شخص معه الرابط (Anyone with the link). الصف الأول عناوين الأعمدة."
            >
              <In
                v={data.url}
                on={(url) => set({ url })}
                dir="ltr"
                ph="https://docs.google.com/spreadsheets/d/…"
              />
            </F>
            <F label="عمود البحث" hint="لو تركت عمود البحث فاضي بيرجع أول صف.">
              <In v={data.lookupColumn} on={(lookupColumn) => set({ lookupColumn })} ph="phone" />
            </F>
            <F label="قيمة البحث">
              <In
                v={data.lookupValue}
                on={(lookupValue) => set({ lookupValue })}
                ph="{{contact.phone}}"
                dir="ltr"
              />
            </F>
            <F label="حفظ أعمدة في متغيّرات" hint="اسم العمود ← اسم المتغيّر">
              {(data.saveAs ?? []).map((m: any, i: number) => (
                <div key={i} className="mb-1 flex gap-1">
                  <In
                    v={m.column}
                    on={(column) =>
                      set({
                        saveAs: data.saveAs.map((x: any, j: number) =>
                          j === i ? { ...x, column } : x,
                        ),
                      })
                    }
                    ph="plan"
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
                    ph="plan"
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
              <Btn
                on={() => set({ saveAs: [...(data.saveAs ?? []), { column: '', variable: '' }] })}
              >
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
                  k === 'sun'
                    ? 'الصيغة: 09:00-17:00, 19:00-22:00 (اتركها فارغة للإجازة)'
                    : undefined
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

        {type === 'random_number' && (
          <>
            <F label={t('أقل قيمة', 'Minimum value')}>
              <In
                v={data.min}
                on={(v) => set({ min: v === '' || v === '-' ? v : Math.trunc(Number(v)) || 0 })}
                dir="ltr"
              />
            </F>
            <F label={t('أعلى قيمة', 'Maximum value')}>
              <In
                v={data.max}
                on={(v) => set({ max: v === '' || v === '-' ? v : Math.trunc(Number(v)) || 0 })}
                dir="ltr"
              />
            </F>
            <F
              label={t('احفظ الرقم في متغيّر', 'Save number as variable')}
              hint={t(
                'رقم صحيح عشوائي يشمل الحدّين، ويُحفظ لاستخدامه في الشروط والرسائل.',
                'A random whole number including both limits, saved for conditions and messages.',
              )}
            >
              <In v={data.saveAs} on={(saveAs) => set({ saveAs })} dir="ltr" />
            </F>
          </>
        )}

        {type === 'split' && (
          <>
            {data.branches.map((b: any, i: number) => (
              <div key={b.id} className="mb-1 flex items-center gap-1">
                <span className="text-xs">
                  {t('فرع', 'Branch')} {i + 1}
                </span>
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
                    on={() =>
                      set({ branches: data.branches.filter((_: any, j: number) => j !== i) })
                    }
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
            <p className="mt-1 text-xs text-gray-400">
              {t(
                'الأوزان نسبية (مثلاً 50 و50 تعني نصف/نصف).',
                'Weights are relative (for example 50 and 50 split equally).',
              )}
            </p>
          </>
        )}

        {type === 'ai_reply' && (
          <>
            <p className="mb-3 rounded bg-indigo-50 p-2 text-xs text-indigo-800">
              {t(
                'يرد المساعد الذكي من قاعدة المعرفة ويستمر في المحادثة مع العميل حتى يخرج منها. اربط مخرجَي "تحويل لموظف" و"فشل" بعقدة تحويل حتى لا يتعطل العميل أبداً.',
                'The assistant replies from knowledge until the customer exits. Connect both human handoff and failure outputs to a handoff step so the customer can continue.',
              )}
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
                aria-label={t(
                  'كلمات تنهي المحادثة مع المساعد',
                  'Keywords that end the assistant conversation',
                )}
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
              {t(
                'أجب فوراً على الرسالة التي بدأت السيناريو',
                'Reply immediately to the message that started the bot',
              )}
            </label>
            <p className="mb-3 text-xs text-gray-400">
              {t(
                'يعمل فقط لو كانت هذه العقدة هي البداية.',
                'Applies only when this is the start step.',
              )}
            </p>
            <F label="احفظ آخر رد في متغيّر (اختياري)">
              <In
                v={data.saveAnswerAs}
                on={(v) => set({ saveAnswerAs: v || undefined })}
                dir="ltr"
              />
            </F>
          </>
        )}

        {type === 'handoff' && (
          <>
            <F label="رسالة للعميل قبل التحويل">
              <Txt v={data.message} on={(message) => set({ message })} rows={2} />
            </F>
            <ChatBubble text={data.message} />
            <p>
              {t(
                'التحويل يوقف البوت ويسلم المحادثة للموظفين. اختر قسمًا أو موظفًا من فريق العمل؛ عند الجمع بينهما يجب أن يكون الموظف عضوًا في القسم.',
                'Handoff stops the bot and transfers the conversation to staff. Choose a department or employee; when both are selected the employee must belong to that department.',
              )}
            </p>
            <F label={t('القسم المسؤول', 'Assigned department')}>
              <select
                className={inp}
                value={data.departmentId ?? ''}
                onChange={(e) =>
                  set({ departmentId: e.target.value || undefined, assignTo: undefined })
                }
              >
                <option value="">{t('بدون قسم محدد', 'No specific department')}</option>
                {data.departmentId && !departments.some((d) => d.id === data.departmentId) && (
                  <option value={data.departmentId}>
                    {t('القسم المحفوظ غير متاح', 'Saved department unavailable')}
                  </option>
                )}
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </F>
            <F label={t('الموظف المسؤول', 'Assigned employee')}>
              <select
                className={inp}
                aria-label={t('الموظف المسؤول', 'Assigned employee')}
                value={data.assignTo ?? ''}
                disabled={staffState !== 'ready'}
                onChange={(e) => set({ assignTo: e.target.value || undefined })}
              >
                <option value="">
                  {t('بدون تعيين محدد — صندوق الوارد', 'Unassigned — inbox')}
                </option>
                {data.assignTo && !staff.some((member) => member.user_id === data.assignTo) && (
                  <option value={data.assignTo}>
                    {t(
                      'التعيين المحفوظ (غير ظاهر في القائمة)',
                      'Saved assignee (not in current list)',
                    )}
                  </option>
                )}
                {staff.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.full_name || member.email}
                    {member.available ? '' : t(' — غير متاح الآن', ' — currently unavailable')}
                  </option>
                ))}
              </select>
            </F>
            {staffState !== 'ready' && (
              <p role="status">
                {staffState === 'loading'
                  ? t('جارٍ تحميل الموظفين…', 'Loading employees…')
                  : t(
                      'تعذر تحميل الموظفين. التعيين المحفوظ لم يتغير؛ يمكن مراجعته في الإعداد المتقدم.',
                      'Could not load employees. Saved assignment is unchanged; review it in advanced settings.',
                    )}
              </p>
            )}
            <ConfigDisclosure>
              <ConfigSummary>{t('تعيين متقدم', 'Advanced assignment')}</ConfigSummary>
              <F label="تعيين لموظف (معرّف المستخدم، اختياري)">
                <In
                  v={data.assignTo}
                  on={(assignTo) => set({ assignTo: assignTo || undefined })}
                  dir="ltr"
                />
              </F>
            </ConfigDisclosure>
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
              {t('إغلاق المحادثة', 'Close conversation')}
            </label>
          </>
        )}
      </div>
    </div>
  );
}
