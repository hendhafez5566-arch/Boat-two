/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import SequenceCenter from './SequenceCenter';
import ChannelScope from '../product/ChannelScope';
import { useChannelContext } from '../product/useChannelContext';

import { statusLabel } from '../product/status';
import TimezonePicker from '../product/TimezonePicker';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { useData } from '../business/useData';
import ConditionModal, {
  CondGroup,
  LabelOption,
  conditionSummary,
} from '../business/ConditionModal';

type Step = {
  id: string;
  delay: { amount: number; unit: 'minutes' | 'hours' | 'days' };
  sendAt?: string;
  content: any;
  condition?: { match: 'all' | 'any'; conditions: any[] };
};
type Seq = {
  id?: string;
  name: string;
  channelId: string;
  timezone: string;
  deliveryTime: string | null;
  stopOnReply: boolean;
  steps: Step[];
  status?: string;
  revision?: number;
};
type Stats = Record<
  string,
  { sent: number; delivered: number; subscribers: number; errors: number }
>;

const uid = () => Math.random().toString(36).slice(2, 8);
const kindOf = (c: any) => (c?.template ? 'template' : c?.cta ? 'cta' : 'text');
const blankStep = (): Step => ({
  id: uid(),
  delay: { amount: 30, unit: 'minutes' },
  content: { text: '' },
});
const blank = (channelId = ''): Seq => ({
  name: '',
  channelId,
  timezone: 'Africa/Cairo',
  deliveryTime: null,
  stopOnReply: true,
  steps: [blankStep()],
});

export default function Sequences() {
  const [channelId, setChannelId] = useChannelContext();
  return <SequenceWorkspace key={channelId} channelId={channelId} setChannelId={setChannelId} />;
}
function SequenceWorkspace({
  channelId,
  setChannelId,
}: {
  channelId: string;
  setChannelId: (value: string) => void;
}) {
  const { t } = useLocale();
  const channels = useData<{ id: string; name: string; type: string }[]>('/channels', []);
  const [cur, setCur] = useState<Seq | null>(null);
  const [stats, setStats] = useState<Stats>({});
  const [msg, setMsg] = useState('');
  const operationLock = useRef(false);
  const opening = useRef(0);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ path: (string | number)[]; message: string }[]>(
    [],
  );
  const eligibleChannels = channels.data.filter(
    (c) =>
      (!channelId || c.id === channelId) && ['whatsapp', 'facebook', 'instagram'].includes(c.type),
  );
  const issueLabel = (path: (string | number)[]) =>
    path[0] === 'steps' && typeof path[1] === 'number'
      ? `${t('الخطوة', 'Step')} ${Number(path[1]) + 1} · ${t('المحتوى أو التوقيت أو الشرط', 'Content, timing or condition')}`
      : (
          {
            name: t('اسم التسلسل', 'Sequence name'),
            channelId: t('القناة', 'Channel'),
            timezone: t('المنطقة الزمنية', 'Time zone'),
            deliveryTime: t('وقت التسليم', 'Delivery time'),
          } as Record<string, string>
        )[String(path[0])] || t('إعدادات التسلسل', 'Sequence settings');
  const labels = useData<LabelOption[]>('/labels', []);
  const [condFor, setCondFor] = useState<number | null>(null);

  useEffect(() => {
    if (!cur?.id) return setStats({});
    let active = true;
    setStats({});
    api<Stats>(`/sequences/${cur.id}/stats`)
      .then((result) => {
        if (active) setStats(result);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [cur?.id]);

  async function open(id: string) {
    if (operationLock.current) return;
    const generation = ++opening.current;
    setBusy(true);
    setMsg('');
    try {
      const r = await api<any>(`/sequences/${id}`);
      if (opening.current !== generation) return;
      setCur({
        id: r.id,
        name: r.name,
        channelId: r.channel_id,
        timezone: r.timezone,
        deliveryTime: r.delivery_time,
        stopOnReply: r.stop_on_reply,
        steps: r.steps,
        status: r.status,
        revision: r.revision,
      });
    } catch (e) {
      if (opening.current === generation) setMsg((e as Error).message);
    } finally {
      if (opening.current === generation) setBusy(false);
    }
  }
  async function run(fn: () => Promise<unknown>, ok: string) {
    if (operationLock.current) return;
    operationLock.current = true;
    setBusy(true);
    setMsg('');
    setFieldErrors([]);
    try {
      await fn();
      setMsg(ok);
    } catch (e) {
      const details = (
        e as Error & { details?: { issues?: { path: (string | number)[]; message: string }[] } }
      ).details;
      if (details?.issues?.length) {
        setFieldErrors(
          details.issues.map((issue) => ({
            ...issue,
            message: /[\u0600-\u06ff]/.test(issue.message)
              ? issue.message
              : t(
                  'راجع هذا الحقل: القيمة مطلوبة ويجب أن تطابق الصيغة والحدود المسموحة.',
                  'Check this field: a value with the supported format and limits is required.',
                ),
          })),
        );
        setMsg(
          t(
            'تعذر الحفظ. صحح الحقول والخطوات الموضحة أدناه.',
            'Save failed. Correct the fields and steps below.',
          ),
        );
      } else setMsg((e as Error).message);
    } finally {
      operationLock.current = false;
      setBusy(false);
    }
  }
  const save = () =>
    run(
      async () => {
        if (!cur) return;
        const problems = [];
        if (!cur.name.trim())
          problems.push({
            path: ['name'],
            message: t('أدخل اسم التسلسل', 'Enter a sequence name'),
          });
        if (!eligibleChannels.some((c) => c.id === cur.channelId))
          problems.push({
            path: ['channelId'],
            message: t(
              'أضف واختر قناة واتساب أو ماسنجر أو إنستغرام؛ قناة الموقع لا تدعم التسلسلات.',
              'Add and select a WhatsApp, Messenger or Instagram channel; website channels do not support sequences.',
            ),
          });
        if (!cur.steps.length)
          problems.push({
            path: ['steps'],
            message: t('أضف خطوة واحدة على الأقل', 'Add at least one step'),
          });
        if (problems.length)
          throw Object.assign(new Error('VALIDATION'), { details: { issues: problems } });
        const body = JSON.stringify({
          expectedRevision: cur.id ? cur.revision : undefined,
          name: cur.name,
          channelId: cur.channelId,
          timezone: cur.timezone,
          deliveryTime: cur.deliveryTime || null,
          stopOnReply: cur.stopOnReply,
          steps: cur.steps,
        });
        if (cur.id) {
          const result = await api<any>(`/sequences/${cur.id}`, { method: 'PUT', body });
          setCur({ ...cur, revision: result.revision });
        } else {
          const r = await api<any>('/sequences', { method: 'POST', body });
          setCur({ ...cur, id: r.id, status: r.status, revision: r.revision });
        }
      },
      t('تم الحفظ', 'Saved'),
    );
  const setStatus = (status: 'active' | 'paused') =>
    run(
      async () => {
        if (!cur?.id) return;
        const result = await api<{ revision: number }>(`/sequences/${cur.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status, expectedRevision: cur.revision }),
        });
        setCur({ ...cur, status, revision: result.revision });
      },
      status === 'active' ? t('تم التفعيل', 'Activated') : t('تم الإيقاف المؤقت', 'Paused'),
    );

  const patchStep = (i: number, patch: Partial<Step>) =>
    cur && setCur({ ...cur, steps: cur.steps.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const setKind = (i: number, kind: string) =>
    patchStep(i, {
      content:
        kind === 'template'
          ? { template: { name: '', language: 'ar', bodyParams: [] } }
          : kind === 'cta'
            ? { text: '', cta: { text: '', url: 'https://' } }
            : { text: '' },
    });

  const unitShort = (s: Step) =>
    `${s.delay.amount} ${s.delay.unit === 'minutes' ? t('دقيقة', 'Mins') : s.delay.unit === 'hours' ? t('ساعة', 'Hours') : t('يوم', 'Days')}`;
  const move = (i: number, d: -1 | 1) =>
    cur &&
    setCur({
      ...cur,
      steps: cur.steps.map((x, k, a) => (k === i + d ? a[i] : k === i ? a[i + d] : x)),
    });

  if (!cur)
    return (
      <div className="sq-page">
        <ChannelScope value={channelId} onChange={setChannelId} channels={channels.data} />
        <SequenceCenter
          key={channelId}
          channelId={channelId}
          busy={busy}
          error={msg}
          onOpen={(id) => void open(id)}
          onCreate={() => {
            setMsg('');
            setCur(blank(eligibleChannels[0]?.id));
          }}
        />
      </div>
    );

  return (
    <div className="sq-page">
      <ChannelScope value={channelId} onChange={setChannelId} channels={channels.data} />
      <div className="sq-top">
        <button disabled={busy} className="sq-link" onClick={() => setCur(null)}>
          ← {t('رجوع', 'Back')}
        </button>
        <h1>{cur.name || t('تسلسل جديد', 'New sequence')}</h1>
        {cur.status && <span className="text-xs opacity-60">{statusLabel(cur.status, t)}</span>}
        <div className="sq-actions">
          <button
            disabled={busy || !eligibleChannels.some((c) => c.id === cur.channelId)}
            className="sq-btn"
            onClick={save}
          >
            {t('حفظ', 'Save')}
          </button>
          {cur.id && cur.status !== 'active' && (
            <button
              disabled={busy}
              className="sq-btn sq-btn-success"
              onClick={() => setStatus('active')}
            >
              {t('تفعيل', 'Activate')}
            </button>
          )}
          {cur.id && cur.status === 'active' && (
            <button disabled={busy} className="sq-btn" onClick={() => setStatus('paused')}>
              {t('إيقاف مؤقت', 'Pause')}
            </button>
          )}
        </div>
      </div>
      {msg && (
        <p className="sq-msg" role="status">
          {msg}
        </p>
      )}
      {fieldErrors.length > 0 && (
        <div role="alert" className="notice error">
          {fieldErrors.map((issue, i) => (
            <p key={i}>
              {issueLabel(issue.path)}: {issue.message}
            </p>
          ))}
        </div>
      )}

      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="sq-layout">
          {/* بطاقة الحملة: New Sequence Campaign */}
          <div className="sq-card">
            <div className="sq-head">
              <span className="sq-ico sq-ico-blue" aria-hidden>
                ➤
              </span>
              <div>
                <h3>{t('حملة تسلسل جديدة', 'New Sequence Campaign')}</h3>
                <small className="sq-sub">
                  {t('أنشئ تسلسل رسائل تلقائي', 'Create an automated outreach sequence')}
                </small>
              </div>
            </div>
            <div className="sq-settings">
              <label className="sq-field">
                {t('الاسم', 'Name')}
                <input
                  value={cur.name}
                  placeholder={t('أول تسلسل تسويقي', 'First Marketing Sequence')}
                  onChange={(e) => setCur({ ...cur, name: e.target.value })}
                />
              </label>
              <label className="sq-field">
                {t('القناة', 'Channel')}
                {!eligibleChannels.length && (
                  <p role="alert">
                    {t(
                      'لا توجد قناة مدعومة. قناة الموقع لا تدعم التسلسلات؛ أضف واتساب أو ماسنجر أو إنستغرام لتتمكن من الحفظ.',
                      'No supported channel. Website chat does not support sequences; add WhatsApp, Messenger or Instagram to save.',
                    )}{' '}
                    <a href="/dashboard/channels">{t('إدارة القنوات', 'Manage channels')}</a>
                  </p>
                )}
                <select
                  aria-invalid={fieldErrors.some((e) => e.path[0] === 'channelId')}
                  value={cur.channelId}
                  disabled={!!cur.id}
                  onChange={(e) => setCur({ ...cur, channelId: e.target.value })}
                >
                  <option value="">{t('اختر القناة', 'Choose a channel')}</option>
                  {eligibleChannels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
              </label>
              <label className="sq-field">
                {t('وقت التسليم (للخطوات بالأيام)', 'Delivery Time (day-based steps)')}
                <input
                  type="time"
                  dir="ltr"
                  value={cur.deliveryTime ?? ''}
                  onChange={(e) => setCur({ ...cur, deliveryTime: e.target.value || null })}
                />
              </label>
              <TimezonePicker
                value={cur.timezone}
                onChange={(timezone) => setCur({ ...cur, timezone })}
              />
              <label className="sq-check">
                <input
                  type="checkbox"
                  checked={cur.stopOnReply}
                  onChange={(e) => setCur({ ...cur, stopOnReply: e.target.checked })}
                />
                {t('إيقاف التسلسل لو العميل رد', 'Stop when the contact replies')}
              </label>
            </div>
            <p className="sq-note" style={{ marginTop: 10 }}>
              {t(
                'يُرسل فقط للعملاء الموافقين على الرسائل التسويقية. على واتساب، أي خطوة بعد 24 ساعة من آخر رسالة للعميل لازم تكون قالب معتمد.',
                'Sent only to contacts who opted in to marketing. On WhatsApp, any step after 24h from the contact’s last message must be an approved template.',
              )}
            </p>
            <div className="sq-node">
              <i /> {t('إعداد التسلسل', 'Set-up New Sequence')} —{' '}
              {t('جدولة رسائل التسلسل', 'Schedule Sequence Message')}
            </div>
          </div>

          <nav
            className="card stack"
            aria-label={t('مخطط التسلسل المحفوظ في المحرر', 'Sequence graph in the editor')}
          >
            <h3>{t('مسار التسلسل', 'Sequence path')}</h3>
            <p>
              {t(
                'كل بطاقة تمثل خطوة فعلية بالترتيب الحالي. اضغطها لتحريرها؛ إعادة الترتيب والحفظ من محرر الخطوات أدناه.',
                'Each card represents a real step in its current order. Select it to edit; reorder and save with the step editor below.',
              )}
            </p>
            <ol className="sequence-path">
              {cur.steps.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="card stack"
                    onClick={() => {
                      const target = document.getElementById('sequence-step-' + s.id);
                      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      target?.focus({ preventScroll: true });
                    }}
                  >
                    <strong>
                      {i + 1}.{' '}
                      {s.content.template?.name ||
                        s.content.text?.slice(0, 60) ||
                        t('رسالة جديدة', 'New message')}
                    </strong>
                    <span>
                      {t('انتظار بعد الخطوة السابقة', 'Wait after the previous step')}:{' '}
                      {s.delay.amount}{' '}
                      {
                        (
                          {
                            minutes: t('دقيقة', 'minutes'),
                            hours: t('ساعة', 'hours'),
                            days: t('يوم', 'days'),
                          } as Record<string, string>
                        )[s.delay.unit]
                      }
                    </span>
                    {s.condition && (
                      <small>{conditionSummary(s.condition as CondGroup, t)?.title}</small>
                    )}
                  </button>
                  {i < cur.steps.length - 1 && (
                    <span className="sequence-connector" aria-hidden="true">
                      ↓
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <div className="sq-steps">
            {cur.steps.map((s, i) => {
              const kind = kindOf(s.content);
              const st = stats[s.id];
              const sum = conditionSummary(s.condition as CondGroup | undefined, t);
              return (
                <div key={s.id} className="sq-row" id={'sequence-step-' + s.id} tabIndex={-1}>
                  {fieldErrors
                    .filter((e) => e.path[0] === 'steps' && e.path[1] === i)
                    .map((e, j) => (
                      <p className="notice error" role="alert" key={j}>
                        {e.message}
                      </p>
                    ))}
                  {/* Send Message After */}
                  <div className="sq-card">
                    <div className="sq-head">
                      <span className="sq-ico sq-ico-blue" aria-hidden>
                        🕒
                      </span>
                      <div style={{ flex: 1 }}>
                        <h3>
                          {t('إرسال الرسالة بعد', 'Send Message After')} · {i + 1}
                        </h3>
                        <small className="sq-sub">
                          {t(
                            'انتظر قبل إرسال الرسالة التالية',
                            'Wait before sending the next message',
                          )}
                        </small>
                      </div>
                      <div className="flex gap-2 text-sm">
                        <button
                          aria-label={t('أعلى', 'Move up')}
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                        >
                          ↑
                        </button>
                        <button
                          aria-label={t('أسفل', 'Move down')}
                          disabled={i === cur.steps.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                    <div className="sq-pill">
                      🕒 {unitShort(s)} : {t('إرسال الرسائل', 'Send Messages')}
                      {s.sendAt ? ` · ${s.sendAt}` : ''}
                    </div>
                    {kind === 'template' && s.content.template?.name && (
                      <div className="sq-pill">⚙ {s.content.template.name}</div>
                    )}
                    <div className="sq-grid3">
                      <label className="sq-field">
                        {t('بعد', 'After')}
                        <input
                          type="number"
                          min={0}
                          value={s.delay.amount}
                          onChange={(e) =>
                            patchStep(i, {
                              delay: {
                                ...s.delay,
                                amount: Math.max(0, Number(e.target.value) || 0),
                              },
                            })
                          }
                        />
                      </label>
                      <label className="sq-field">
                        {t('الوحدة', 'Unit')}
                        <select
                          value={s.delay.unit}
                          onChange={(e) =>
                            patchStep(i, { delay: { ...s.delay, unit: e.target.value as any } })
                          }
                        >
                          <option value="minutes">{t('دقائق', 'Minutes')}</option>
                          <option value="hours">{t('ساعات', 'Hours')}</option>
                          <option value="days">{t('أيام', 'Days')}</option>
                        </select>
                      </label>
                      <label className="sq-field">
                        {t('طريقة التوقيت', 'Timing mode')}
                        <select
                          value={s.sendAt !== undefined ? 'clock' : 'delay'}
                          onChange={(e) =>
                            patchStep(i, {
                              sendAt:
                                e.target.value === 'clock'
                                  ? cur.deliveryTime || '09:00'
                                  : undefined,
                            })
                          }
                        >
                          <option value="delay">{t('بعد مدة الانتظار', 'After the delay')}</option>
                          <option value="clock">
                            {t('في وقت محدد بعد الانتظار', 'At a set time after the delay')}
                          </option>
                        </select>
                        {s.sendAt !== undefined && (
                          <input
                            type="time"
                            aria-label={t('وقت الخطوة', 'Step time')}
                            required
                            value={s.sendAt}
                            onChange={(e) => patchStep(i, { sendAt: e.target.value })}
                          />
                        )}
                      </label>
                    </div>
                    <p className="sq-note">
                      {t('بعد', 'After')} {unitShort(s)}{' '}
                      {i === 0
                        ? t('من الاشتراك', 'from enrollment')
                        : t('من الخطوة السابقة', 'from the preceding step')}
                      {s.sendAt || (s.delay.unit === 'days' && cur.deliveryTime)
                        ? t(
                            '، ثم أول موعد للساعة المحددة بعد انتهاء الانتظار: ',
                            ', then the first selected clock time after that delay: ',
                          ) + (s.sendAt || cur.deliveryTime)
                        : t('، دون انتظار ساعة محددة', ', without waiting for a clock time')}{' '}
                      · <bdi>{cur.timezone}</bdi>
                    </p>
                    {sum && (
                      <div className="sq-cond">
                        <b>⏷ {sum.title}</b>
                        <small>{sum.sub}</small>
                      </div>
                    )}
                    <div className="sq-foot">
                      <button className="sq-link" onClick={() => setCondFor(i)}>
                        {s.condition
                          ? t('تعديل الشرط', 'Edit condition')
                          : t('+ إضافة شرط', '+ Add condition')}
                      </button>
                      <button
                        className="sq-link sq-link-danger"
                        onClick={() =>
                          setCur({ ...cur, steps: cur.steps.filter((_, k) => k !== i) })
                        }
                      >
                        ✕ {t('حذف الخطوة', 'Delete step')}
                      </button>
                    </div>
                  </div>

                  {/* Text / Template message with stats */}
                  <div className="sq-card">
                    <div className="sq-head">
                      <span className="sq-ico sq-ico-green" aria-hidden>
                        💬
                      </span>
                      <div>
                        <h3>
                          {kind === 'template'
                            ? t('قالب', 'Template')
                            : kind === 'cta'
                              ? t('نص + زر', 'Text + Button')
                              : t('نص', 'Text')}
                        </h3>
                        <small className="sq-sub">
                          {t('محتوى الرسالة والإحصائيات', 'Message content and statistics')}
                        </small>
                      </div>
                    </div>
                    {cur.id && st && st.sent + st.delivered + st.subscribers + st.errors > 0 && (
                      <details>
                        <summary>{t('إحصاءات الرسالة', 'Message statistics')}</summary>
                        <div className="sq-stats">
                          <div>
                            ✈ {t('أُرسلت', 'Sent')}
                            <b>{st?.sent ?? 0}</b>
                          </div>
                          <div>
                            ✓ {t('وصلت', 'Delivered')}
                            <b>{st?.delivered ?? 0}</b>
                          </div>
                          <div>
                            👥 {t('مشتركون', 'Subscribers')}
                            <b>{st?.subscribers ?? 0}</b>
                          </div>
                          <div className={st?.errors ? 'is-err' : ''}>
                            ⚠ {t('أخطاء', 'Errors')}
                            <b>{st?.errors ?? 0}</b>
                          </div>
                        </div>
                      </details>
                    )}
                    {kind !== 'template' && (
                      <div className="sq-body">
                        <textarea
                          rows={3}
                          placeholder={t('نص الرسالة', 'Message text')}
                          value={s.content.text ?? ''}
                          onChange={(e) =>
                            patchStep(i, { content: { ...s.content, text: e.target.value } })
                          }
                        />
                      </div>
                    )}
                    {kind === 'cta' && (
                      <div className="sq-grid2" style={{ marginTop: 8 }}>
                        <input
                          className="sq-in"
                          placeholder={t('نص الزر (حتى 20 حرف)', 'Button label (max 20)')}
                          value={s.content.cta.text}
                          onChange={(e) =>
                            patchStep(i, {
                              content: {
                                ...s.content,
                                cta: { ...s.content.cta, text: e.target.value.slice(0, 20) },
                              },
                            })
                          }
                        />
                        <input
                          className="sq-in"
                          dir="ltr"
                          placeholder="https://"
                          value={s.content.cta.url}
                          onChange={(e) =>
                            patchStep(i, {
                              content: {
                                ...s.content,
                                cta: { ...s.content.cta, url: e.target.value },
                              },
                            })
                          }
                        />
                      </div>
                    )}
                    {kind === 'template' && (
                      <div className="sq-grid3">
                        <input
                          className="sq-in"
                          dir="ltr"
                          placeholder="template_name"
                          value={s.content.template.name}
                          onChange={(e) =>
                            patchStep(i, {
                              content: {
                                template: { ...s.content.template, name: e.target.value },
                              },
                            })
                          }
                        />
                        <input
                          className="sq-in"
                          dir="ltr"
                          placeholder="ar"
                          value={s.content.template.language}
                          onChange={(e) =>
                            patchStep(i, {
                              content: {
                                template: { ...s.content.template, language: e.target.value },
                              },
                            })
                          }
                        />
                        <input
                          className="sq-in"
                          placeholder={t('متغيّرات مفصولة بـ |', 'Variables separated by |')}
                          value={(s.content.template.bodyParams ?? []).join('|')}
                          onChange={(e) =>
                            patchStep(i, {
                              content: {
                                template: {
                                  ...s.content.template,
                                  bodyParams: e.target.value.split('|').filter(Boolean),
                                },
                              },
                            })
                          }
                        />
                      </div>
                    )}
                    <div className="sq-foot">
                      <span>💬 {t('الرسالة', 'Message')}</span>
                      <select
                        className="sq-in"
                        style={{ width: 'auto', margin: 0 }}
                        aria-label={t('نوع الرسالة', 'Message type')}
                        value={kind}
                        onChange={(e) => setKind(i, e.target.value)}
                      >
                        <option value="text">{t('نص', 'Text')}</option>
                        <option value="cta">{t('نص + زر رابط', 'Text + link button')}</option>
                        <option value="template">{t('قالب واتساب', 'WhatsApp template')}</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
            <div>
              <button
                className="sq-btn sq-add"
                onClick={() => setCur({ ...cur, steps: [...cur.steps, blankStep()] })}
              >
                {t('+ خطوة', '+ Step')}
              </button>
            </div>
          </div>
        </div>
      </fieldset>
      <ConditionModal
        open={condFor !== null}
        value={
          condFor !== null ? (cur.steps[condFor]?.condition as CondGroup | undefined) : undefined
        }
        labels={labels.data}
        onClose={() => setCondFor(null)}
        onSave={(v) => {
          if (condFor !== null) patchStep(condFor, { condition: v as Step['condition'] });
          setCondFor(null);
        }}
      />
    </div>
  );
}
