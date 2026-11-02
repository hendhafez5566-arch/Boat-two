'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useData } from './useData';
import { useLocale } from '../product/locale';
import { Button } from '../product/ProductUI';
import { NavIcon } from '../product/NavIcon';
import { automationLabel } from './automation-labels';
import styles from './crm-workspace.module.css';
import css from './sales.module.css';
export function CrmAutomation() {
  const { t } = useLocale();
  const pipelines = useData<{ id: string; name: string; stages: string[] }[]>('/crm/pipelines', []);
  const team = useData<{ members: { user_id: string; full_name: string }[] }>(
    '/crm/workspace/members',
    { members: [] },
  );
  const fields = useData<{ key: string; label: string; type: string }[]>('/crm/fields', []);
  const [name, setName] = useState(''),
    [trigger, setTrigger] = useState('crm.contacts.insert'),
    [type, setType] = useState('task'),
    [title, setTitle] = useState(''),
    [tag, setTag] = useState(''),
    [pipeline, setPipeline] = useState(''),
    [stage, setStage] = useState(''),
    [user, setUser] = useState(''),
    [field, setField] = useState(''),
    [value, setValue] = useState(''),
    [minutes, setMinutes] = useState(60),
    [enabled, setEnabled] = useState(false),
    [linkDeal, setLinkDeal] = useState(false),
    [preview, setPreview] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [conditionBand, setConditionBand] = useState(''),
    [conditionKey, setConditionKey] = useState(''),
    [conditionValue, setConditionValue] = useState(''),
    [conditionKind, setConditionKind] = useState('string'),
    [minimumDeal, setMinimumDeal] = useState('');
  const p = pipelines.data.find((x) => x.id === pipeline) || pipelines.data[0];
  const f = fields.data.find((x) => x.key === field) || fields.data[0];
  const action =
    type === 'task'
      ? { type, title, delayMinutes: minutes, linkDeal }
      : type === 'deal'
        ? {
            type,
            title,
            pipelineId: p?.id,
            stage: stage || p?.stages[0],
            valueCents: 0,
            currency: 'EGP',
          }
        : type === 'assign'
          ? { type, userId: user }
          : type === 'notify'
            ? { type, title }
            : type === 'tag'
              ? { type, tag: value }
              : type === 'lifecycle'
                ? { type, value: value || 'qualified' }
                : type === 'field'
                  ? {
                      type,
                      key: f?.key,
                      value:
                        f?.type === 'number'
                          ? Number(value)
                          : f?.type === 'boolean'
                            ? value === 'true'
                            : value,
                    }
                  : { type, pipelineId: p?.id, stage: stage || p?.stages[0] };
  const rule = {
    name,
    trigger,
    enabled,
    conditions: {
      ...(tag ? { tag } : {}),
      ...(conditionBand ? { scoreBand: conditionBand } : {}),
      ...(minimumDeal !== '' ? { minDealValue: Number(minimumDeal) } : {}),
      ...(conditionKey
        ? {
            attribute: {
              key: conditionKey,
              value:
                conditionKind === 'number'
                  ? Number(conditionValue)
                  : conditionKind === 'boolean'
                    ? conditionValue === 'true'
                    : conditionValue,
            },
          }
        : {}),
    },
    actions: [action],
  };
  const fingerprint = JSON.stringify(rule);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (preview !== fingerprint) {
        const result = await api<{ matched: boolean; executed: boolean }>('/automations/preview', {
          method: 'POST',
          body: JSON.stringify({
            rule,
            contact: {
              name: 'Synthetic preview',
              tags: tag ? [tag] : [],
              attributes: conditionKey
                ? {
                    [conditionKey]:
                      conditionKind === 'number'
                        ? Number(conditionValue)
                        : conditionKind === 'boolean'
                          ? conditionValue === 'true'
                          : conditionValue,
                  }
                : {},
            },
          }),
        });
        setPreview(fingerprint);
        setNotice(
          result.matched
            ? t(
                'المعاينة الاصطناعية مطابقة. لم يُنفذ أي إجراء. راجع الملخص ثم احفظ.',
                'Synthetic preview matched. No actions executed. Review the summary, then save.',
              )
            : t(
                'لم تطابق بيانات المعاينة الشروط. لم يُنفذ إجراء.',
                'Synthetic data did not match. No actions executed.',
              ),
        );
      } else {
        await api('/automations', { method: 'POST', body: JSON.stringify(rule) });
        setNotice(
          t(
            'حُفظت القاعدة. يمكنك إدارتها ومراجعة سجلها من الأتمتة.',
            'Rule saved. Manage it and review history in Automations.',
          ),
        );
        setPreview('');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function template(kind: string) {
    setPreview('');
    setConditionBand('');
    setConditionKey('');
    setMinimumDeal('');
    setType(kind === 'stage' ? 'task' : kind === 'interest' ? 'deal' : 'notify');
    setTrigger(
      kind === 'stage'
        ? 'crm.deal.stage_changed'
        : kind === 'interest'
          ? 'crm.bot.answer'
          : 'crm.conversation.taken',
    );
    setName(
      kind === 'stage'
        ? t('متابعة بعد تغيير المرحلة', 'Follow up after stage change')
        : kind === 'interest'
          ? t('فرصة للمهتمين', 'Interested lead opportunity')
          : t('تنبيه استلام المحادثة', 'Conversation takeover alert'),
    );
    setTitle(
      kind === 'stage'
        ? t('تابع الصفقة', 'Follow up deal')
        : kind === 'interest'
          ? t('فرصة جديدة', 'New opportunity')
          : t('تم استلام المحادثة', 'Conversation taken'),
    );
    setTag(kind === 'interest' ? 'interested' : '');
    setLinkDeal(kind === 'stage');
  }
  return (
    <section className={styles.card}>
      <h2>
        <NavIcon name="automations" />
        {t('أتمتة المبيعات والمتابعات', 'Sales & follow-up automation')}
      </h2>
      <p>
        {t(
          'قواعد داخلية عبر محرك الأتمتة الحالي. اختبر بعميل اصطناعي قبل الحفظ.',
          'Internal rules using the existing automation engine. Preview with a synthetic customer before saving.',
        )}
      </p>
      <div className={css.row}>
        {[
          ['stage', 'متابعة مرحلة', 'Stage follow-up'],
          ['interest', 'فرصة اهتمام', 'Interest opportunity'],
          ['takeover', 'تنبيه الاستلام', 'Takeover alert'],
        ].map(([v, ar, en]) => (
          <button type="button" className="btn" key={v} onClick={() => template(v)}>
            {t(ar, en)}
          </button>
        ))}
      </div>
      <form className={`${styles.form} ${css.fields}`} onSubmit={submit}>
        <label>
          {t('اسم القاعدة', 'Rule name')}
          <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {t('عندما', 'When')}
          <select value={trigger} onChange={(e) => setTrigger(e.target.value)}>
            {[
              'crm.contacts.insert',
              'crm.contacts.update',
              'crm.bot.answer',
              'crm.tag.added',
              'crm.lifecycle.changed',
              'crm.crm_deals.insert',
              'crm.deal.stage_changed',
              'crm.deal.closed',
              'crm.task.overdue',
              'crm.conversation.created',
              'crm.conversation.taken',
            ].map((v) => (
              <option value={v} key={v}>
                {automationLabel(v, t)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('بوجود وسم (اختياري)', 'With tag (optional)')}
          <input maxLength={50} value={tag} onChange={(e) => setTag(e.target.value)} />
        </label>
        <details>
          <summary>
            {t('شروط الاهتمام والصفقة وبيانات العميل', 'Interest, deal & customer conditions')}
          </summary>
          <div className={styles.form}>
            <label>
              {t('درجة الاهتمام', 'Interest band')}
              <select
                aria-label={t('درجة الاهتمام', 'Interest band')}
                value={conditionBand}
                onChange={(e) => setConditionBand(e.target.value)}
              >
                <option value="">{t('أي تقييم', 'Any band')}</option>
                <option value="hot">{t('مرتفع', 'Hot')}</option>
                <option value="warm">{t('متوسط', 'Warm')}</option>
                <option value="cold">{t('منخفض', 'Cold')}</option>
              </select>
            </label>
            <label>
              {t('أقل قيمة صفقة بالقرش/السنت', 'Minimum deal value in minor units')}
              <input
                type="number"
                min={0}
                max={100000000000}
                value={minimumDeal}
                onChange={(e) => setMinimumDeal(e.target.value)}
              />
            </label>
            <label>
              {t('مفتاح حقل العميل أو إجابة البوت', 'Customer field or bot answer key')}
              <input
                maxLength={100}
                value={conditionKey}
                onChange={(e) => setConditionKey(e.target.value)}
              />
            </label>
            {conditionKey && (
              <>
                <label>
                  {t('نوع قيمة الشرط', 'Condition value type')}
                  <select
                    aria-label={t('نوع قيمة الشرط', 'Condition value type')}
                    value={conditionKind}
                    onChange={(e) => {
                      setConditionKind(e.target.value);
                      setConditionValue(
                        e.target.value === 'boolean'
                          ? 'false'
                          : e.target.value === 'number'
                            ? '0'
                            : '',
                      );
                    }}
                  >
                    <option value="string">{t('نص', 'Text')}</option>
                    <option value="number">{t('رقم', 'Number')}</option>
                    <option value="boolean">{t('نعم/لا', 'Boolean')}</option>
                  </select>
                </label>
                <label>
                  {t('يساوي', 'Equals')}
                  {conditionKind === 'boolean' ? (
                    <select
                      value={conditionValue}
                      onChange={(e) => setConditionValue(e.target.value)}
                    >
                      <option value="true">{t('نعم', 'True')}</option>
                      <option value="false">{t('لا', 'False')}</option>
                    </select>
                  ) : (
                    <input
                      maxLength={2000}
                      type={conditionKind === 'number' ? 'number' : 'text'}
                      value={conditionValue}
                      onChange={(e) => setConditionValue(e.target.value)}
                    />
                  )}
                </label>
              </>
            )}
          </div>
        </details>
        <label>
          {t('الإجراء', 'Action')}
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {['task', 'deal', 'assign', 'notify', 'tag', 'lifecycle', 'field', 'moveDeal'].map(
              (v) => (
                <option value={v} key={v}>
                  {automationLabel(v, t)}
                </option>
              ),
            )}
          </select>
        </label>
        {['task', 'deal', 'notify'].includes(type) && (
          <label>
            {t('العنوان', 'Title')}
            <input
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
        )}
        {type === 'task' && (
          <>
            <label>
              {t('بعد (دقائق)', 'After (minutes)')}
              <input
                required
                type="number"
                min={0}
                max={525600}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </label>
            <label>
              <span>
                <input
                  type="checkbox"
                  checked={linkDeal}
                  onChange={(e) => setLinkDeal(e.target.checked)}
                />
                {t('ربط بصفقة الحدث (محفز صفقة فقط)', 'Link to event deal (deal trigger only)')}
              </span>
            </label>
          </>
        )}
        {['deal', 'moveDeal'].includes(type) && (
          <>
            <label>
              {t('خط المبيعات', 'Pipeline')}
              <select
                required
                value={p?.id || ''}
                onChange={(e) => {
                  setPipeline(e.target.value);
                  setStage('');
                }}
              >
                <option value="" disabled>
                  {t('اختر خطًا', 'Select pipeline')}
                </option>
                {pipelines.data.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('المرحلة', 'Stage')}
              <select
                required
                value={stage || p?.stages[0] || ''}
                onChange={(e) => setStage(e.target.value)}
              >
                {p?.stages.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </>
        )}
        {type === 'assign' && (
          <label>
            {t('الموظف', 'Employee')}
            <select required value={user} onChange={(e) => setUser(e.target.value)}>
              <option value="">{t('اختر موظفًا', 'Select employee')}</option>
              {team.data.members.map((m) => (
                <option value={m.user_id} key={m.user_id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </label>
        )}
        {type === 'field' && (
          <label>
            {t('الحقل المخصص', 'Custom field')}
            <select required value={f?.key || ''} onChange={(e) => setField(e.target.value)}>
              {fields.data.map((f) => (
                <option value={f.key} key={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {type === 'lifecycle' ? (
          <label>
            {t('الحالة الجديدة', 'New lifecycle')}
            <select value={value || 'qualified'} onChange={(e) => setValue(e.target.value)}>
              {[
                ['lead', 'عميل محتمل', 'Lead'],
                ['qualified', 'مؤهل', 'Qualified'],
                ['customer', 'عميل', 'Customer'],
                ['inactive', 'غير نشط', 'Inactive'],
              ].map(([v, ar, en]) => (
                <option key={v} value={v}>
                  {t(ar, en)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          ['tag', 'field'].includes(type) && (
            <label>
              {t('القيمة', 'Value')}
              <input required value={value} onChange={(e) => setValue(e.target.value)} />
              {type === 'field' && f?.type === 'boolean' && <small>true / false</small>}
            </label>
          )
        )}
        <div className={css.summary}>
          {t('عندما: ', 'When: ')}
          {automationLabel(trigger, t)}
          {tag ? ' · ' + t('الوسم: ', 'Tag: ') + tag : ''}
          {conditionBand ? ' · ' + t('الاهتمام: ', 'Interest: ') + conditionBand : ''}
          {conditionKey ? ' · ' + conditionKey + ' = ' + conditionValue : ''} →{' '}
          {automationLabel(type, t)}
          {title ? ' · ' + title : ''}
        </div>
        <label>
          <span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            {t('تفعيل القاعدة عند الحفظ', 'Enable when saved')}
          </span>
        </label>
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        <Button busy={busy} type="submit">
          {preview === fingerprint
            ? t('حفظ القاعدة', 'Save rule')
            : t('معاينة واختبار اصطناعي', 'Preview & synthetic test')}
        </Button>
      </form>
      <p>
        <Link className="btn" href="/dashboard/automations">
          {t('إدارة القواعد وAND/OR وسجل التنفيذ', 'Manage rules, AND/OR & execution history')}
        </Link>
      </p>
    </section>
  );
}
