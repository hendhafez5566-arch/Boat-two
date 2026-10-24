/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
import { useData } from '../../../components/business/useData';
import ConditionModal, { CondGroup, LabelOption, conditionSummary } from '../../../components/business/ConditionModal';

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
};
type Stats = Record<string, { sent: number; delivered: number; subscribers: number; errors: number }>;

const uid = () => Math.random().toString(36).slice(2, 8);
const kindOf = (c: any) => (c?.template ? 'template' : c?.cta ? 'cta' : 'text');
const blankStep = (): Step => ({ id: uid(), delay: { amount: 30, unit: 'minutes' }, content: { text: '' } });
const blank = (channelId = ''): Seq => ({
  name: '',
  channelId,
  timezone: 'Africa/Cairo',
  deliveryTime: null,
  stopOnReply: true,
  steps: [blankStep()],
});

export default function Sequences() {
  const { t } = useLocale();
  const list = useData<any[]>('/sequences', []);
  const channels = useData<{ id: string; name: string; type: string }[]>('/channels', []);
  const [cur, setCur] = useState<Seq | null>(null);
  const [stats, setStats] = useState<Stats>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const labels = useData<LabelOption[]>('/labels', []);
  const [condFor, setCondFor] = useState<number | null>(null);

  useEffect(() => {
    if (!cur?.id) return setStats({});
    api<Stats>(`/sequences/${cur.id}/stats`).then(setStats).catch(() => {});
  }, [cur?.id]);

  async function open(id: string) {
    const r = await api<any>(`/sequences/${id}`);
    setCur({
      id: r.id,
      name: r.name,
      channelId: r.channel_id,
      timezone: r.timezone,
      deliveryTime: r.delivery_time,
      stopOnReply: r.stop_on_reply,
      steps: r.steps,
      status: r.status,
    });
    setMsg('');
  }
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg('');
    try {
      await fn();
      setMsg(ok);
      list.reload?.();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const save = () =>
    run(async () => {
      if (!cur) return;
      const body = JSON.stringify({
        name: cur.name,
        channelId: cur.channelId,
        timezone: cur.timezone,
        deliveryTime: cur.deliveryTime || null,
        stopOnReply: cur.stopOnReply,
        steps: cur.steps,
      });
      if (cur.id) await api(`/sequences/${cur.id}`, { method: 'PUT', body });
      else {
        const r = await api<any>('/sequences', { method: 'POST', body });
        setCur({ ...cur, id: r.id, status: r.status });
      }
    }, t('تم الحفظ', 'Saved'));
  const setStatus = (status: 'active' | 'paused') =>
    run(async () => {
      if (!cur?.id) return;
      await api(`/sequences/${cur.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setCur({ ...cur, status });
    }, status === 'active' ? t('تم التفعيل', 'Activated') : t('تم الإيقاف المؤقت', 'Paused'));

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
    cur && setCur({ ...cur, steps: cur.steps.map((x, k, a) => (k === i + d ? a[i] : k === i ? a[i + d] : x)) });

  if (!cur)
    return (
      <div className="sq-page">
        <div className="sq-top">
          <h1>{t('التسلسلات (Sequence)', 'Sequences')}</h1>
          <div className="sq-actions">
            <button className="sq-btn sq-btn-primary" onClick={() => setCur(blank(channels.data.find((c) => c.type !== 'web')?.id))}>
              {t('+ تسلسل جديد', '+ New sequence')}
            </button>
          </div>
        </div>
        {!list.data.length && <p className="sq-note">{t('لا توجد تسلسلات بعد.', 'No sequences yet.')}</p>}
        <div className="sq-list">
          {list.data.map((s) => (
            <button key={s.id} className="sq-item" onClick={() => open(s.id)}>
              <strong>{s.name}</strong> <span className="text-xs opacity-60">· {s.status}</span>
              <div className="text-xs opacity-70">
                {s.channel_name} · {s.step_count} {t('خطوات', 'steps')} · {t('نشط', 'active')} {s.active} · {t('مكتمل', 'completed')} {s.completed}
              </div>
            </button>
          ))}
        </div>
      </div>
    );

  return (
    <div className="sq-page">
      <div className="sq-top">
        <button className="sq-link" onClick={() => setCur(null)}>← {t('رجوع', 'Back')}</button>
        <h1>{cur.name || t('تسلسل جديد', 'New sequence')}</h1>
        {cur.status && <span className="text-xs opacity-60">{cur.status}</span>}
        <div className="sq-actions">
          <button disabled={busy} className="sq-btn" onClick={save}>{t('حفظ', 'Save')}</button>
          {cur.id && cur.status !== 'active' && (
            <button disabled={busy} className="sq-btn sq-btn-success" onClick={() => setStatus('active')}>{t('تفعيل', 'Activate')}</button>
          )}
          {cur.id && cur.status === 'active' && (
            <button disabled={busy} className="sq-btn" onClick={() => setStatus('paused')}>{t('إيقاف مؤقت', 'Pause')}</button>
          )}
        </div>
      </div>
      {msg && <p className="sq-msg" role="status">{msg}</p>}

      <div className="sq-layout">
        {/* بطاقة الحملة: New Sequence Campaign */}
        <div className="sq-card">
          <div className="sq-head">
            <span className="sq-ico sq-ico-blue" aria-hidden>➤</span>
            <div>
              <h3>{t('حملة تسلسل جديدة', 'New Sequence Campaign')}</h3>
              <small className="sq-sub">{t('أنشئ تسلسل رسائل تلقائي', 'Create an automated outreach sequence')}</small>
            </div>
          </div>
          <div className="sq-settings">
            <label className="sq-field">{t('الاسم', 'Name')}
              <input value={cur.name} placeholder={t('أول تسلسل تسويقي', 'First Marketing Sequence')} onChange={(e) => setCur({ ...cur, name: e.target.value })} />
            </label>
            <label className="sq-field">{t('القناة', 'Channel')}
              <select value={cur.channelId} disabled={!!cur.id} onChange={(e) => setCur({ ...cur, channelId: e.target.value })}>
                {channels.data.filter((c) => c.type !== 'web').map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                ))}
              </select>
            </label>
            <label className="sq-field">{t('وقت التسليم (للخطوات بالأيام)', 'Delivery Time (day-based steps)')}
              <input dir="ltr" placeholder="09:00" value={cur.deliveryTime ?? ''} onChange={(e) => setCur({ ...cur, deliveryTime: e.target.value || null })} />
            </label>
            <label className="sq-field">{t('المنطقة الزمنية', 'Time zone')}
              <input dir="ltr" value={cur.timezone} onChange={(e) => setCur({ ...cur, timezone: e.target.value })} />
            </label>
            <label className="sq-check">
              <input type="checkbox" checked={cur.stopOnReply} onChange={(e) => setCur({ ...cur, stopOnReply: e.target.checked })} />
              {t('إيقاف التسلسل لو العميل رد', 'Stop when the contact replies')}
            </label>
          </div>
          <p className="sq-note" style={{ marginTop: 10 }}>
            {t(
              'يُرسل فقط للعملاء الموافقين على الرسائل التسويقية. على واتساب، أي خطوة بعد 24 ساعة من آخر رسالة للعميل لازم تكون قالب معتمد.',
              'Sent only to contacts who opted in to marketing. On WhatsApp, any step after 24h from the contact’s last message must be an approved template.',
            )}
          </p>
          <div className="sq-node"><i /> {t('إعداد التسلسل', 'Set-up New Sequence')} — {t('جدولة رسائل التسلسل', 'Schedule Sequence Message')}</div>
        </div>

        <div className="sq-steps">
          {cur.steps.map((s, i) => {
            const kind = kindOf(s.content);
            const st = stats[s.id];
            const sum = conditionSummary(s.condition as CondGroup | undefined, t);
            return (
              <div key={s.id} className="sq-row">
                {/* Send Message After */}
                <div className="sq-card">
                  <div className="sq-head">
                    <span className="sq-ico sq-ico-blue" aria-hidden>🕒</span>
                    <div style={{ flex: 1 }}>
                      <h3>{t('إرسال الرسالة بعد', 'Send Message After')} · {i + 1}</h3>
                      <small className="sq-sub">{t('انتظر قبل إرسال الرسالة التالية', 'Wait before sending the next message')}</small>
                    </div>
                    <div className="flex gap-2 text-sm">
                      <button aria-label={t('أعلى', 'Move up')} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                      <button aria-label={t('أسفل', 'Move down')} disabled={i === cur.steps.length - 1} onClick={() => move(i, 1)}>↓</button>
                    </div>
                  </div>
                  <div className="sq-pill">🕒 {unitShort(s)} : {t('إرسال الرسائل', 'Send Messages')}{s.sendAt ? ` · ${s.sendAt}` : ''}</div>
                  {kind === 'template' && s.content.template?.name && (
                    <div className="sq-pill">⚙ {s.content.template.name}</div>
                  )}
                  <div className="sq-grid3">
                    <label className="sq-field">{t('بعد', 'After')}
                      <input type="number" min={0} value={s.delay.amount} onChange={(e) => patchStep(i, { delay: { ...s.delay, amount: Math.max(0, Number(e.target.value) || 0) } })} />
                    </label>
                    <label className="sq-field">{t('الوحدة', 'Unit')}
                      <select value={s.delay.unit} onChange={(e) => patchStep(i, { delay: { ...s.delay, unit: e.target.value as any } })}>
                        <option value="minutes">{t('دقائق', 'Minutes')}</option>
                        <option value="hours">{t('ساعات', 'Hours')}</option>
                        <option value="days">{t('أيام', 'Days')}</option>
                      </select>
                    </label>
                    <label className="sq-field">{t('وقت ثابت', 'Fixed time')}
                      <input dir="ltr" placeholder="HH:MM" value={s.sendAt ?? ''} onChange={(e) => patchStep(i, { sendAt: e.target.value || undefined })} />
                    </label>
                  </div>
                  {sum && (
                    <div className="sq-cond">
                      <b>⏷ {sum.title}</b>
                      <small>{sum.sub}</small>
                    </div>
                  )}
                  <div className="sq-foot">
                    <button className="sq-link" onClick={() => setCondFor(i)}>
                      {s.condition ? t('تعديل الشرط', 'Edit condition') : t('+ إضافة شرط', '+ Add condition')}
                    </button>
                    <button className="sq-link sq-link-danger" onClick={() => setCur({ ...cur, steps: cur.steps.filter((_, k) => k !== i) })}>
                      ✕ {t('حذف الخطوة', 'Delete step')}
                    </button>
                  </div>
                </div>

                {/* Text / Template message with stats */}
                <div className="sq-card">
                  <div className="sq-head">
                    <span className="sq-ico sq-ico-green" aria-hidden>💬</span>
                    <div>
                      <h3>{kind === 'template' ? t('قالب', 'Template') : kind === 'cta' ? t('نص + زر', 'Text + Button') : t('نص', 'Text')}</h3>
                      <small className="sq-sub">{t('محتوى الرسالة والإحصائيات', 'Message content and statistics')}</small>
                    </div>
                  </div>
                  <div className="sq-stats">
                    <div>✈ {t('أُرسلت', 'Sent')}<b>{st?.sent ?? 0}</b></div>
                    <div>✓ {t('وصلت', 'Delivered')}<b>{st?.delivered ?? 0}</b></div>
                    <div>👥 {t('مشتركون', 'Subscribers')}<b>{st?.subscribers ?? 0}</b></div>
                    <div className={st?.errors ? 'is-err' : ''}>⚠ {t('أخطاء', 'Errors')}<b>{st?.errors ?? 0}</b></div>
                  </div>
                  {kind !== 'template' && (
                    <div className="sq-body">
                      <textarea rows={3} placeholder={t('نص الرسالة', 'Message text')} value={s.content.text ?? ''} onChange={(e) => patchStep(i, { content: { ...s.content, text: e.target.value } })} />
                    </div>
                  )}
                  {kind === 'cta' && (
                    <div className="sq-grid2" style={{ marginTop: 8 }}>
                      <input className="sq-in" placeholder={t('نص الزر (حتى 20 حرف)', 'Button label (max 20)')} value={s.content.cta.text} onChange={(e) => patchStep(i, { content: { ...s.content, cta: { ...s.content.cta, text: e.target.value.slice(0, 20) } } })} />
                      <input className="sq-in" dir="ltr" placeholder="https://" value={s.content.cta.url} onChange={(e) => patchStep(i, { content: { ...s.content, cta: { ...s.content.cta, url: e.target.value } } })} />
                    </div>
                  )}
                  {kind === 'template' && (
                    <div className="sq-grid3">
                      <input className="sq-in" dir="ltr" placeholder="template_name" value={s.content.template.name} onChange={(e) => patchStep(i, { content: { template: { ...s.content.template, name: e.target.value } } })} />
                      <input className="sq-in" dir="ltr" placeholder="ar" value={s.content.template.language} onChange={(e) => patchStep(i, { content: { template: { ...s.content.template, language: e.target.value } } })} />
                      <input className="sq-in" placeholder={t('متغيّرات مفصولة بـ |', 'Variables separated by |')} value={(s.content.template.bodyParams ?? []).join('|')} onChange={(e) => patchStep(i, { content: { template: { ...s.content.template, bodyParams: e.target.value.split('|').filter(Boolean) } } })} />
                    </div>
                  )}
                  <div className="sq-foot">
                    <span>💬 {t('الرسالة', 'Message')}</span>
                    <select className="sq-in" style={{ width: 'auto', margin: 0 }} aria-label={t('نوع الرسالة', 'Message type')} value={kind} onChange={(e) => setKind(i, e.target.value)}>
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
            <button className="sq-btn sq-add" onClick={() => setCur({ ...cur, steps: [...cur.steps, blankStep()] })}>
              {t('+ خطوة', '+ Step')}
            </button>
          </div>
        </div>
      </div>

      <ConditionModal
        open={condFor !== null}
        value={condFor !== null ? (cur.steps[condFor]?.condition as CondGroup | undefined) : undefined}
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
