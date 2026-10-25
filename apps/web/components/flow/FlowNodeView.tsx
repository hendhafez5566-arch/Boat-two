'use client';
import { FlowStatsAvailabilityContext } from './stats-context';
import MediaPreview from './MediaPreview';
import ListPreview from './ListPreview';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { memo, useContext, useEffect, CSSProperties } from 'react';
import { FlowAnalyticsContext, FlowButtonStatsContext, FlowSequencesContext, FlowStatsContext } from './stats-context';
import { Handle, NodeProps, Position, useUpdateNodeInternals } from 'reactflow';
import { handlesFor, NODE_META, optionsOf, RFData, summary } from '../../lib/flow-types';
import { useLocale } from '../product/locale';
import { NodeIcon, nodeLabel, editorLabel } from './presentation';
/** الخطوات التي ترسل رسائل للعميل فتظهر لها إحصائيات الإرسال */
const SENDERS = ['product','catalog','whatsapp_flow','message', 'interactive', 'image', 'audio', 'video', 'file', 'location', 'cta_url', 'template', 'question', 'user_input', 'ai_reply', 'handoff'];
const safeImg = (u: unknown) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : "");
const attachName = (type: string, d: Record<string, unknown> | undefined) => {
  const raw = String((type === 'file' && d?.filename) || d?.url || '').trim();
  if (!raw || raw === 'https://') return type;
  try {
    const last = decodeURIComponent(new URL(raw).pathname.split('/').filter(Boolean).pop() ?? '');
    return last || new URL(raw).host;
  } catch {
    return raw.slice(0, 40);
  }
};
function FlowNodeView({ id, data, selected }: NodeProps<RFData>) {
  const { language, t } = useLocale(),
    meta = NODE_META[data.type],
    handles = handlesFor(data.type, data.data),
    update = useUpdateNodeInternals(),
    cards = !!data.splitButtons,
    cardOption = new Set<string>(optionsOf(data.data ?? {}).map((o) => `option:${o.id}`)),
    shown = cards ? handles.filter((h) => !cardOption.has(h.id)) : handles,
    key = handles.map((h) => h.id).join('|') + (cards ? '|cards' : '');
  const analytics = useContext(FlowAnalyticsContext);
  const available = useContext(FlowStatsAvailabilityContext).nodes;
  const stats = useContext(FlowStatsContext)[id];
  const optionStats = useContext(FlowButtonStatsContext);
  const seq = useContext(FlowSequencesContext)[String(data.data?.sequenceId ?? '')];
  const split = handles.some((h) => h.id.startsWith('option:'));
  const image = safeImg(data.type === 'image' ? data.data?.url : data.data?.media?.kind === 'image' ? data.data.media.url : data.data?.imageUrl);
  const text = summary(data.type, data.data, language);
  const placeholders = ['—', '(فارغة)', '(empty)', '(بدون نص)', '(no text)'];
  const incomplete =
    !['end', 'handoff', 'subflow'].includes(data.type) &&
    (!text || placeholders.includes(text.trim()) || /^\(?(بدون نص|no text)\)? → \{\{\?\}\}$/.test(text.trim()));
  useEffect(() => {
    update(id);
  }, [id, key, update, language]);
  return (
    <div
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      className={`premium-flow-node fn-card fn-${data.type} ${split ? 'fn-split' : ''} ${data.isStart ? 'is-start' : ''} ${selected ? 'is-selected' : ''} ${data.issue ? 'has-issue' : ''} ${incomplete ? 'is-incomplete' : ''} ${data.preview ? 'is-preview-' + data.preview : ''}`}
      style={{ '--node-color': meta.color } as CSSProperties}
      aria-label={nodeLabel(data.type, language)}
    >
      <Handle type="target" position={Position.Top} title={t('نقطة الدخول: أسقط التوصيل هنا', 'Entry point: drop a link here')} />
      {data.actions && (
        <div className="flow-node-tools" role="toolbar" aria-label={t('إجراءات الخطوة', 'Step actions')}>
          {!data.isStart && (
            <button
              type="button"
              className="nodrag"
              title={t('تعيين كبداية', 'Set as start')}
              aria-label={t('تعيين كبداية', 'Set as start')}
              onClick={() => data.actions?.setStart(id)}
            >
              ▶
            </button>
          )}
          <button
            type="button"
            className="nodrag"
            title={t('تكرار (Ctrl+D)', 'Duplicate (Ctrl+D)')}
            aria-label={t('تكرار الخطوة', 'Duplicate step')}
            onClick={() => data.actions?.duplicate(id)}
          >
            ⧉
          </button>
          <button
            type="button"
            className="nodrag danger"
            title={t('حذف (Delete)', 'Delete (Delete)')}
            aria-label={t('حذف الخطوة', 'Delete step')}
            onClick={() => data.actions?.remove(id)}
          >
            ✕
          </button>
        </div>
      )}
      <div className="fn-main">
      <div className="flow-node-heading">
        <span className="flow-node-icon">
          <NodeIcon type={data.type} />
        </span>
        <strong>{nodeLabel(data.type, language)}</strong>
        {data.isStart && <span className="flow-start-badge">{t('بداية', 'Start')}</span>}
      </div>
      {SENDERS.includes(data.type) && (
        <div className="fn-stats" aria-label={t('إحصائيات الخطوة', 'Step statistics')} title={available ? t('المصدر: حالات الرسائل', 'Source: message statuses') : t('الإحصائيات غير متاحة حاليًا', 'Statistics currently unavailable')}>
          <span title={t('أُرسلت', 'Sent')}>✈ {t('أُرسلت', 'Sent')}<b>{available ? stats?.sent ?? 0 : '—'}</b></span>
          <span title={t('وصلت', 'Delivered')}>✓ {t('وصلت', 'Delivered')}<b>{available ? stats?.delivered ?? 0 : '—'}</b></span>
          <span title={t('عملاء', 'Subscribers')}>◉ {t('عملاء', 'Subscribers')}<b>{available ? stats?.subscribers ?? 0 : '—'}</b></span>
          <span className={stats?.errors ? 'is-err' : ''} title={t('أخطاء', 'Errors')}>⚠ {t('أخطاء', 'Errors')}<b>{available ? stats?.errors ?? 0 : '—'}</b></span>
        </div>
      )}
      {['audio', 'video', 'file'].includes(data.type) && (
        <div className={`fn-attach fn-attach-${data.type}`} dir="ltr">
          <span className="fn-attach-icon" aria-hidden="true">
            {data.type === 'audio' ? '🎙️' : data.type === 'video' ? '▶' : '📎'}
          </span>
          <span className="fn-attach-name">{attachName(data.type, data.data)}</span>
          {data.type === 'audio' && <span className="fn-wave" aria-hidden="true" />}
        </div>
      )}
      {data.type === 'random_number' && (
        <div className="fn-range" dir="ltr">
          <b>{String(data.data?.min ?? 1)}</b>
          <span aria-hidden="true">⟷</span>
          <b>{String(data.data?.max ?? 100)}</b>
        </div>
      )}
      {data.type === 'sequence' && (
        <div className="fn-seq">
          <div className="fn-seq-name">{seq?.name || t('اختر تسلسلًا', 'Choose a sequence')}</div>
          <div className="fn-seq-time" dir="ltr">
            <span aria-hidden="true">🕒</span>
            <small>{t('وقت التسليم', 'Delivery Time')}</small>
            <b>{seq?.deliveryTime || '—'}</b>
            {seq?.timezone && <em>{seq.timezone}</em>}
          </div>
          <div className="fn-seq-foot">
            <span><i aria-hidden="true" /> {t('إعداد التسلسل', 'Set-up New Sequence')}</span>
            <span>{t('جدولة رسائل التسلسل', 'Schedule Sequence Message')}</span>
          </div>
        </div>
      )}
      {data.type === 'user_input' && (
        <div className="fn-uiq">
          {(Array.isArray(data.data?.questions) ? (data.data.questions as any[]) : []).slice(0, 3).map((q, qi) => (
            <div className="fn-uiq-card" key={q.id ?? qi}>
              <div className="fn-uiq-title">❓ {t('سؤال جديد', 'New Question')} <small>{qi + 1}</small></div>
              <div className="fn-uiq-tag">{q.kind === 'choice' ? t('اختيار متعدد', 'Multiple Choice') : t('نص حر', 'Free input')}</div>
              <p>{q.text || t('(بدون نص)', '(no text)')}</p>
              {q.kind === 'choice' &&
                (q.options ?? []).slice(0, 4).map((o: any) => (
                  <label className="fn-uiq-opt" key={o.id}>
                    <i aria-hidden="true" />
                    {o.title || '…'}
                    {analytics && optionStats[`${id}:${o.id}`] && <small className="fn-uiq-clicks"> · 👆 {analytics && optionStats[`${id}:${o.id}`].clicks}</small>}
                  </label>
                ))}
              <div className="fn-uiq-save">
                <small>{t('حفظ في حقل مخصص', 'Save to custom field')}</small>
                <code>{q.saveAs || '—'}</code>
              </div>
            </div>
          ))}
          {Array.isArray(data.data?.questions) && data.data.questions.length > 3 && (
            <div className="fn-uiq-more">+{data.data.questions.length - 3} {t('أسئلة أخرى', 'more questions')}</div>
          )}
        </div>
      )}
      {data.type !== 'user_input' && data.type !== 'sequence' && (
      <div className="flow-node-summary fn-body">
        {incomplete ? (
          <span className="flow-node-empty">
            ⚠ {t('خطوة غير مكتملة، اضغط لإكمالها', 'Incomplete step, select to finish it')}
          </span>
        ) : (
          text
        )}
      </div>
      )}
      {data.type === 'cta_url' && data.data.buttonText && <div className="fn-cta">🔗 {data.data.buttonText}</div>}
      {data.note && (
        <div className="flow-node-note" title={t('تعليق', 'Comment')}>
          {data.note}
        </div>
      )}
      {data.issue && (
        <div className="flow-node-issue" role="status">
          {data.issue}
        </div>
      )}
      </div>
      {(image || data.data?.imageUrl || ['image','video','audio','file'].includes(data.type) || data.data?.media) && <MediaPreview media={data.data?.media || {kind: data.type === 'cta_url' ? 'image' : data.type, url: image || data.data?.imageUrl || data.data?.url, caption:data.data?.caption,filename:data.data?.filename}} />}
      {data.data?.list && <ListPreview list={data.data.list} />}
      {cards && (
        <Handle
          type="source"
          id="btns"
          isConnectable={false}
          position={language === 'ar' ? Position.Left : Position.Right}
          style={{ [language === 'ar' ? 'left' : 'right']: -6, top: '50%' }}
        />
      )}
      {shown.map((h) => (
        <div
          key={h.id}
          className={`flow-node-port ${h.id.startsWith('option:') ? 'is-pill' : ''} ${shown.length === 1 ? 'is-single' : ''} ${data.linked && !data.linked.includes(h.id) ? 'is-open' : ''}`}
        >
          {h.id.startsWith('option:') && <span className="fn-btn-kind">▣ {t('زر', 'Button')}</span>}
          <span className="fn-btn-title">{editorLabel(h.label, language)}</span>
          {/* One output → bottom-centre so the flow reads top-to-bottom in both RTL and LTR. */}
          {shown.length === 1 ? (
            <Handle
              type="source"
              position={Position.Bottom}
              id={h.id}
              title={t('نقطة الخروج: اسحب منها إلى الخطوة التالية', 'Exit point: drag to the next step')}
              style={{ left: '50%', bottom: -6, top: 'auto' }}
            />
          ) : (
            <Handle
              type="source"
              position={language === 'ar' ? Position.Left : Position.Right}
              id={h.id}
              title={t('نقطة الخروج: اسحب منها إلى الخطوة التالية', 'Exit point: drag to the next step')}
              style={{ [language === 'ar' ? 'left' : 'right']: -6, top: '50%' }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
export default memo(FlowNodeView);
