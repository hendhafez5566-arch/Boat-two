'use client';
import { useEffect, useMemo, useState } from 'react';
import { useLocale } from '../product/locale';

export type Cond = {
  source: 'variable' | 'contact_field' | 'contact_attribute' | 'last_message' | 'channel' | 'label';
  key?: string;
  operator: string;
  value?: string;
};
export type CondGroup = { match: 'all' | 'any'; conditions: Cond[] };
export type LabelOption = { label: string; contacts: number };

const MAX_RULES = 10;
const LABEL_OPS = ['contains', 'not_contains', 'is_set', 'is_not_set'];
const TEXT_OPS = ['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'is_set', 'is_not_set', 'greater_than', 'less_than', 'matches_regex'];
const OP_LABEL: Record<string, [string, string]> = {
  greater_than: ['أكبر من', 'Greater than'],
  less_than: ['أصغر من', 'Less than'],
  matches_regex: ['يطابق تعبيرًا نمطيًا', 'Matches regex'],
  equals: ['يساوي', 'Equals'],
  not_equals: ['لا يساوي', 'Not equals'],
  contains: ['يحتوي', 'Contains'],
  not_contains: ['لا يحتوي', 'Does not contain'],
  starts_with: ['يبدأ بـ', 'Starts with'],
  ends_with: ['ينتهي بـ', 'Ends with'],
  is_set: ['موجود', 'Is set'],
  is_not_set: ['غير موجود', 'Is not set'],
};
const noValue = (op: string) => op === 'is_set' || op === 'is_not_set';
// "System field" rows = subscriber profile data: label + name/phone/email. "Custom field" rows = attributes.
const isSystem = (c: Cond) => c.source === 'label' || c.source === 'contact_field';
const sysVar = (c: Cond) => (c.source === 'label' ? 'label' : c.key || 'name');

/** هل الشرط مكتمل بما يكفي للحفظ؟ */
export function conditionComplete(c: Cond) {
  if (['variable', 'contact_attribute', 'contact_field'].includes(c.source) && !(c.key ?? '').trim()) return false;
  if (!noValue(c.operator) && !(c.value ?? '').trim()) return false;
  return true;
}

/** ملخّص قصير يظهر على بطاقة الخطوة (Condition Enabled · Match Type: All) */
export function conditionSummary(g: CondGroup | undefined, t: (ar: string, en: string) => string) {
  if (!g?.conditions?.length) return null;
  return {
    title: t('الشرط مفعّل', 'Condition Enabled'),
    sub: `${t('نوع المطابقة', 'Match Type')}: ${g.match === 'any' ? t('أي شرط', 'Any') : t('الكل', 'All')} · ${g.conditions.length}`,
  };
}

export default function ConditionModal({
  open,
  value,
  labels,
  onSave,
  onClose,
}: {
  open: boolean;
  value?: CondGroup;
  labels: LabelOption[];
  onSave: (v: CondGroup | undefined) => void;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const [match, setMatch] = useState<'all' | 'any'>('all');
  const [rows, setRows] = useState<Cond[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setMatch(value?.match ?? 'all');
    // الصفوف التي لا تنتمي للشاشة (متغيّر/آخر رسالة/قناة) تبقى كما هي ولا تُحذف عند الحفظ
    setRows(value?.conditions ?? []);
    setErr('');
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);

  const labelNames = useMemo(() => labels.map((l) => l.label), [labels]);
  if (!open) return null;

  const patch = (i: number, p: Partial<Cond>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const remove = (i: number) => setRows((r) => r.filter((_, k) => k !== i));
  const canAdd = rows.length < MAX_RULES;
  const addSystem = () => canAdd && setRows((r) => [...r, { source: 'label', operator: 'contains', value: '' }]);
  const addCustom = () => canAdd && setRows((r) => [...r, { source: 'contact_attribute', key: '', operator: 'equals', value: '' }]);

  function save() {
    const bad = rows.findIndex((c) => !conditionComplete(c));
    if (bad >= 0) {
      setErr(t('أكمل كل الشروط قبل الحفظ (الوسم/الحقل والقيمة).', 'Complete every rule before saving (label/field and value).'));
      return;
    }
    onSave(rows.length ? { match, conditions: rows.map((c) => (noValue(c.operator) ? { ...c, value: undefined } : c)) } : undefined);
  }

  const sysRows = rows.map((c, i) => ({ c, i })).filter((x) => isSystem(x.c));
  const customRows = rows.map((c, i) => ({ c, i })).filter((x) => x.c.source === 'contact_attribute');
  const otherRows = rows.map((c, i) => ({ c, i })).filter(({ c }) => !isSystem(c) && c.source !== 'contact_attribute');

  const sel = 'cm-input';
  return (
    <div className="cm-overlay" role="dialog" aria-modal="true" aria-label={t('إعداد الشرط', 'Configure Condition')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cm-card">
        <header className="cm-head">
          <span className="cm-badge cm-badge-blue" aria-hidden>⑂</span>
          <div>
            <h2>{t('إعداد الشرط', 'Configure Condition')}</h2>
            <p>{t('حدّد قواعد لتفريع المسار حسب بيانات العميل.', 'Define rules to branch the flow when subscriber data matches.')}</p>
          </div>
        </header>

        <section className="cm-section">
          <div className="cm-sec-head">
            <span className="cm-badge cm-badge-green" aria-hidden>⏷</span>
            <div>
              <h3>{t('نوع المطابقة', 'Match type')}</h3>
              <p>{t('اختر هل يلزم تحقق كل القواعد أم واحدة فقط.', 'Choose whether all rules or any single rule must pass.')}</p>
            </div>
          </div>
          <div className="cm-match">
            {(['all', 'any'] as const).map((m) => (
              <label key={m} className={`cm-radio ${match === m ? 'is-on' : ''}`}>
                <input type="radio" name="cm-match" checked={match === m} onChange={() => setMatch(m)} />
                <span className="cm-dot" aria-hidden />
                <span>
                  <b>{m === 'all' ? t('تطابق الكل', 'All Match') : t('تطابق أي واحد', 'Any Match')}</b>
                  <small>{m === 'all' ? t('كل القواعد أدناه لازم تتحقق.', 'Every rule below must be true.') : t('يكفي تحقق قاعدة واحدة على الأقل.', 'At least one rule below must be true.')}</small>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="cm-section">
          <div className="cm-sec-head">
            <span className="cm-badge cm-badge-sky" aria-hidden>👥</span>
            <div>
              <h3>{t('حقل النظام', 'System Field')}</h3>
              <p>{t('قواعد على بيانات ملف العميل.', 'Rules based on subscriber profile data.')}</p>
            </div>
            <button type="button" className="cm-add" onClick={addSystem} disabled={!canAdd} aria-label={t('إضافة قاعدة نظام', 'Add system rule')}>+</button>
          </div>
          {!sysRows.length && <p className="cm-empty">{t('لا توجد قواعد نظام. اضغط + لإضافة قاعدة.', 'No system rules. Press + to add one.')}</p>}
          {sysRows.map(({ c, i }) => {
            const v = sysVar(c);
            const ops = v === 'label' ? LABEL_OPS : TEXT_OPS;
            return (
              <div className="cm-row" key={i}>
                <label>
                  <span>{t('المتغيّر', 'Variable')}</span>
                  <select className={sel} value={v} onChange={(e) => {
                    const nv = e.target.value;
                    patch(i, nv === 'label' ? { source: 'label', key: undefined, operator: 'contains', value: '' } : { source: 'contact_field', key: nv, operator: 'equals', value: '' });
                  }}>
                    <option value="label">{t('الوسم (Label)', 'Label')}</option>
                    <option value="name">{t('الاسم', 'Name')}</option>
                    <option value="phone">{t('الهاتف', 'Phone')}</option>
                    <option value="email">{t('البريد', 'Email')}</option>
                  </select>
                </label>
                <label>
                  <span>{t('العملية', 'Operator')}</span>
                  <select className={sel} value={c.operator} onChange={(e) => patch(i, { operator: e.target.value })}>
                    {ops.map((o) => <option key={o} value={o}>{t(...OP_LABEL[o])}</option>)}
                  </select>
                </label>
                <label>
                  <span>{v === 'label' ? t('الوسم', 'Contact group / label') : t('القيمة', 'Value')}</span>
                  {noValue(c.operator) ? (
                    <input className={sel} disabled placeholder="—" />
                  ) : v === 'label' ? (
                    <select className={sel} value={c.value ?? ''} onChange={(e) => patch(i, { value: e.target.value })}>
                      <option value="">{t('اختر وسمًا', 'Select a label')}</option>
                      {c.value && !labelNames.includes(c.value) && <option value={c.value}>{c.value}</option>}
                      {labels.map((l) => <option key={l.label} value={l.label}>{l.label} ({l.contacts})</option>)}
                    </select>
                  ) : (
                    <input className={sel} value={c.value ?? ''} onChange={(e) => patch(i, { value: e.target.value })} />
                  )}
                </label>
                <button type="button" className="cm-del" onClick={() => remove(i)} aria-label={t('حذف القاعدة', 'Delete rule')}>✕</button>
              </div>
            );
          })}
          {sysRows.some((x) => x.c.source === 'label') && !labels.length && (
            <p className="cm-hint">{t('مفيش وسوم على أي عميل لسه. الوسوم بتتضاف من بلوك "تعيين وسم" أو من إدارة العملاء.', 'No labels on any contact yet. Labels are added by the Label Assign block or in CRM.')}</p>
          )}
        </section>

        <section className="cm-section">
          <div className="cm-sec-head">
            <span className="cm-badge cm-badge-violet" aria-hidden>▤</span>
            <div>
              <h3>{t('حقل مخصص', 'Custom Field')}</h3>
              <p>{t('قواعد على قيم الحقول المخصصة.', 'Rules based on custom field values.')}</p>
            </div>
            <button type="button" className="cm-add" onClick={addCustom} disabled={!canAdd} aria-label={t('إضافة قاعدة مخصصة', 'Add custom rule')}>+</button>
          </div>
          {!customRows.length && <p className="cm-empty">{t('لا توجد قواعد مخصصة. اضغط + لإضافة قاعدة.', 'No custom rules. Press + to add one.')}</p>}
          {customRows.map(({ c, i }) => (
            <div className="cm-row" key={i}>
              <label>
                <span>{t('المتغيّر', 'Variable')}</span>
                <input className={sel} dir="ltr" placeholder="plan" value={c.key ?? ''} onChange={(e) => patch(i, { key: e.target.value })} />
              </label>
              <label>
                <span>{t('العملية', 'Operator')}</span>
                <select className={sel} value={c.operator} onChange={(e) => patch(i, { operator: e.target.value })}>
                  {TEXT_OPS.map((o) => <option key={o} value={o}>{t(...OP_LABEL[o])}</option>)}
                </select>
              </label>
              <label>
                <span>{t('القيمة', 'Value')}</span>
                <input className={sel} disabled={noValue(c.operator)} placeholder={noValue(c.operator) ? '—' : ''} value={c.value ?? ''} onChange={(e) => patch(i, { value: e.target.value })} />
              </label>
              <button type="button" className="cm-del" onClick={() => remove(i)} aria-label={t('حذف القاعدة', 'Delete rule')}>✕</button>
            </div>
          ))}
        </section>

        <section className="cm-section">
          <div className="cm-sec-head">
            <h3>{t('ردود المحادثة والمتغيّرات', 'Conversation replies and variables')}</h3>
            <button type="button" className="cm-add" disabled={!canAdd} aria-label={t('إضافة قاعدة محادثة', 'Add conversation rule')} onClick={() => setRows((r) => [...r, { source: 'variable', key: '', operator: 'equals', value: '' }])}>+</button>
          </div>
          {otherRows.map(({ c, i }) => (
            <div className="cm-row" key={i}>
              <label><span>{t('مصدر القيمة', 'Value source')}</span>
                <select className={sel} value={c.source} onChange={(e) => patch(i, { source: e.target.value as Cond['source'] })}>
                  <option value="variable">{t('متغيّر من المحادثة', 'Conversation variable')}</option>
                  <option value="last_message">{t('آخر رسالة للعميل', 'Last customer message')}</option>
                  <option value="channel">{t('القناة', 'Channel')}</option>
                </select>
              </label>
              {c.source === 'variable' && <label><span>{t('اسم المتغيّر', 'Variable name')}</span><input className={sel} dir="ltr" value={c.key ?? ''} onChange={(e) => patch(i, { key: e.target.value })} /></label>}
              <label><span>{t('المقارنة', 'Comparison')}</span><select className={sel} value={c.operator} onChange={(e) => patch(i, { operator: e.target.value })}>
                {TEXT_OPS.map((o) => <option key={o} value={o}>{t(...OP_LABEL[o])}</option>)}
              </select></label>
              {!noValue(c.operator) && <label><span>{t('القيمة', 'Value')}</span><input className={sel} value={c.value ?? ''} onChange={(e) => patch(i, { value: e.target.value })} /></label>}
              <button type="button" className="cm-del" onClick={() => remove(i)} aria-label={t('حذف القاعدة', 'Delete rule')}>✕</button>
            </div>
          ))}
        </section>
        {err && <p className="cm-err" role="alert">{err}</p>}

        <footer className="cm-foot">
          <button type="button" className="cm-btn" onClick={onClose}>✕ {t('إغلاق', 'Close')}</button>
          <button type="button" className="cm-btn cm-btn-primary" onClick={save}>💾 {t('حفظ التغييرات', 'Save Changes')}</button>
        </footer>
      </div>
    </div>
  );
}
