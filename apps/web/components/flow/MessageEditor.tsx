'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ReactNode, useRef, useState } from 'react';
import { useLocale } from '../product/locale';
import { uid } from '../../lib/flow-types';
import { Choice, ChoiceData, convertChoices, insertToken, moveChoice, patchChoice } from '../../lib/smart-editor';
import { ConditionVariable } from '../business/ConditionModal';

export function EditorSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="smart-section"><h3>{title}</h3>{children}</section>;
}
export function ChatBubble({ text }: { text?: string }) {
  const { t } = useLocale();
  return <div className="smart-chat"><span>{t('معاينة المحتوى — بدون إرسال', 'Content preview — no delivery')}</span><div className="smart-bubble" dir="auto">{text || t('رسالتك هتظهر هنا…', 'Your message appears here…')}</div></div>;
}
export default function MessageEditor({ data, onChange, variables, renderAction }: { data: ChoiceData; onChange: (data: ChoiceData) => void; variables: ConditionVariable[]; renderAction?: (handle: string, title: string) => ReactNode }) {
  const { t } = useLocale();
  const input = useRef<HTMLTextAreaElement>(null);
  const caret = useRef({ start: 0, end: 0 });
  const [suggest, setSuggest] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const mode = data.list ? 'list' : data.buttons?.length ? 'buttons' : 'none';
  const groups = data.list?.sections ?? [{ rows: data.buttons ?? [] }];
  const choices = groups.flatMap(s => s.rows);
  const set = (patch: any) => onChange({ ...data, ...patch });
  const changeMode = (next: 'none' | 'buttons' | 'list') => {
    if (next === mode) return;
    if (next === 'none' && choices.length && !confirm(t('إزالة الاختيارات ووصلاتها؟ يمكنك التراجع.', 'Remove choices and links? You can undo.'))) return;
    if (next === 'buttons' && data.list && (groups.some(s => s.title || s.rows.some(r => r.description)) || data.list.buttonText) && !confirm(t('الأزرار لا تدعم عناوين الأقسام وأوصاف الصفوف ونص فتح القائمة. تظل المعرّفات والوصلات. متابعة؟', 'Buttons do not display section headings, descriptions or menu text. IDs and links stay. Continue?'))) return;
    try { onChange(convertChoices(data, next)); setError(''); } catch { setError(t('حد واتساب: 3 أزرار بعناوين حتى 20 حرفًا، أو 10 اختيارات قائمة حتى 24 حرفًا. قلّلها يدويًا؛ لم نحذف شيئًا.', 'WhatsApp limits: 3 buttons, 20 characters; or 10 list choices, 24 characters. Reduce manually; nothing was deleted.')); }
  };
  const updateRows = (index: number, rows: Choice[]) => mode === 'list' ? set({ list: { ...data.list, sections: groups.map((s, i) => i === index ? { ...s, rows } : s) } }) : set({ buttons: rows });
  const active = choices.find(c => c.id === selected);
  if (active) return <section className="smart-drill"><button type="button" onClick={() => setSelected(null)}>← {t('اختيارات العميل', 'Customer choices')}</button><h3>{t('عندما يضغط العميل على', 'When the customer selects')} «{active.title}»</h3><label>{t('عنوان الاختيار', 'Choice title')}<input value={active.title} maxLength={mode === 'list' ? 24 : 20} onChange={e => onChange(patchChoice(data, active.id, { title: e.target.value }))} /></label>{mode === 'list' && <label>{t('وصف اختياري', 'Optional description')}<textarea value={active.description ?? ''} maxLength={72} onChange={e => onChange(patchChoice(data, active.id, { description: e.target.value }))} /></label>}{renderAction?.(`option:${active.id}`, active.title)}</section>;
  return <>
    <EditorSection title={t('العميل هيشوف إيه؟', 'What will the customer see?')}>
      <textarea ref={input} aria-label={t('نص الرسالة', 'Message text')} rows={5} value={data.text ?? ''} onSelect={e => { caret.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }} onChange={e => { set({ text: e.target.value }); caret.current = { start: e.target.selectionStart, end: e.target.selectionEnd }; setSuggest(e.target.value.slice(0, e.target.selectionStart).endsWith('{{')); }} />
      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setSuggest(!suggest)} aria-expanded={suggest}>{t('إضافة بيانات العميل', 'Insert customer data')}</button>
      {suggest && <div className="smart-variable-picker">{[{ key: 'contact.name', label: t('اسم العميل', 'Customer name') }, { key: 'contact.phone', label: t('هاتف العميل', 'Customer phone') }, { key: 'contact.email', label: t('بريد العميل', 'Customer email') }, ...variables].map(v => <button type="button" key={v.key} onMouseDown={e => e.preventDefault()} onClick={() => { const result = insertToken(data.text ?? '', caret.current.start, caret.current.end, v.key); set({ text: result.text }); setSuggest(false); requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(result.caret, result.caret); }); }}>{v.label}</button>)}</div>}
      <ChatBubble text={data.text} />
      <details><summary>{t('إضافة صورة / فيديو / صوت / ملف', 'Add image / video / audio / file')}</summary><p>{t('رابط ملف مستضاف فقط؛ رفع الملفات غير متاح هنا.', 'Hosted URL only; file upload is unavailable here.')}</p><label>{t('نوع المرفق', 'Media type')}<select value={data.media?.kind ?? ''} onChange={e => set({ media: e.target.value ? { ...data.media, kind: e.target.value, url: data.media?.url ?? '' } : undefined })}><option value="">{t('بدون', 'None')}</option>{[['image','صورة','Image'],['video','فيديو','Video'],['audio','صوت','Audio'],['file','ملف','File']].map(([v,ar,en]) => <option key={v} value={v}>{t(ar,en)}</option>)}</select></label>{data.media && <><label>{t('رابط HTTPS', 'HTTPS URL')}<input dir="ltr" value={data.media.url} onChange={e => set({ media: { ...data.media, url: e.target.value } })} /></label><label>{t('تعليق', 'Caption')}<input value={data.media.caption ?? ''} onChange={e => set({ media: { ...data.media, caption: e.target.value } })} /></label><p>{t('المعاينة لا تحمل المرفق تلقائيًا. راجع الرابط ونوع الملف قبل النشر.', 'Preview does not automatically load attachments. Check the URL and file type before publishing.')}</p></>}</details>
    </EditorSection>
    <EditorSection title={t('اختيارات العميل', 'Customer choices')}>
      <div className="smart-segments">{(['none','buttons','list'] as const).map((m,i) => <button type="button" key={m} aria-pressed={mode === m} onClick={() => changeMode(m)}>{[t('بدون', 'None'), t('أزرار', 'Buttons'), t('قائمة', 'List')][i]}</button>)}</div>
      {error && <p role="alert">{error}</p>}
      {mode === 'list' && <label>{t('نص زر فتح القائمة', 'Menu button text')}<input maxLength={20} value={data.list?.buttonText ?? ''} onChange={e => set({ list: { ...data.list, buttonText: e.target.value } })} /></label>}
      {mode !== 'none' && groups.map((group, gi) => <div key={gi} className="smart-choice-group">{mode === 'list' && <label>{t('عنوان القسم (اختياري)', 'Section heading (optional)')}<input maxLength={24} value={group.title ?? ''} onChange={e => set({ list: { ...data.list, sections: groups.map((s,i) => i === gi ? { ...s, title: e.target.value } : s) } })} /></label>}{group.rows.map((c,i) => <article className="smart-choice" key={c.id}><button type="button" className="smart-choice-main" onClick={() => setSelected(c.id)}><strong>{c.title || t('اختيار بدون عنوان', 'Untitled choice')}</strong>{c.description && <span>{c.description}</span>}<span>{t('إعداد الإجراء ←', 'Configure action →')}</span></button><div className="smart-choice-tools"><button type="button" disabled={i === 0} aria-label={t('تحريك لأعلى', 'Move up')} onClick={() => updateRows(gi, moveChoice(group.rows,c.id,-1))}>↑</button><button type="button" disabled={i === group.rows.length-1} aria-label={t('تحريك لأسفل', 'Move down')} onClick={() => updateRows(gi,moveChoice(group.rows,c.id,1))}>↓</button><details><summary>{t('المزيد', 'More')}</summary><button type="button" onClick={() => { if (confirm(t('حذف الاختيار ووصلته؟ يمكنك التراجع.', 'Delete choice and its link? You can undo.'))) updateRows(gi,group.rows.filter(r => r.id !== c.id)); }}>{t('حذف الاختيار', 'Delete choice')}</button></details></div></article>)}{choices.length < (mode === 'buttons' ? 3 : 10) && <button type="button" onClick={() => updateRows(gi,[...group.rows,{id:uid(),title:t('اختيار جديد','New choice')}])}>+ {t('إضافة اختيار', 'Add choice')}</button>}</div>)}
      <p>{t('واتساب: حتى 3 أزرار (20 حرفًا) أو 10 صفوف قائمة (24 حرفًا).', 'WhatsApp: up to 3 buttons (20 characters) or 10 list rows (24 characters).')}</p>
      {!!choices.length && <details><summary>{t('حفظ اختيار العميل', 'Save customer choice')}</summary><label>{t('اسم المتغيّر', 'Variable name')}<input dir="ltr" value={data.saveReplyAs ?? ''} onChange={e => set({ saveReplyAs:e.target.value || undefined })} /></label><p>{t('يُحفظ العنوان، والمعرّف الثابت في متغيّر بنفس الاسم مع _id.', 'The title is saved, with the stable ID in the same variable suffixed _id.')}</p></details>}
    </EditorSection>
  </>;
}
