'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ReactNode, useRef, useState } from 'react';
import { useLocale } from '../product/locale';
import { uid } from '../../lib/flow-types';
import {
  Choice,
  ChoiceData,
  convertChoices,
  insertToken,
  moveChoice,
  patchChoice,
} from '../../lib/smart-editor';
import { ConditionVariable } from '../business/ConditionModal';
import { ConfigDisclosure, ConfigSummary } from './ConfigDisclosure';
import ButtonActionsEditor from './ButtonActionsEditor';
import styles from './automation-config.module.css';
export function EditorSection({
  title,
  description,
  optional = false,
  children,
}: {
  title: string;
  description?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  const { t } = useLocale();
  return (
    <section className={styles.section}>
      <div>
        <h3>
          {title}
          {optional && <span className={styles.optional}>{t('اختياري', 'Optional')}</span>}
        </h3>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {children}
    </section>
  );
}
export function ChatBubble({
  text,
  header,
  footer,
  choices,
  list,
  listLabel,
}: {
  text?: string;
  header?: string;
  footer?: string;
  choices?: string[];
  list?: boolean;
  listLabel?: string;
}) {
  const { t } = useLocale();
  return (
    <div className="smart-chat">
      <span>{t('معاينة المحتوى', 'Content Preview')}</span>
      <div className="smart-bubble" dir="auto">
        {header && <strong className="smart-bubble-head">{header}</strong>}
        {text || t('رسالتك تظهر هنا…', 'Your message appears here…')}
        {footer && <small className="smart-bubble-foot">{footer}</small>}
      </div>
      {!!choices?.length &&
        (list ? (
          <div className="smart-bubble-choices is-list">
            <span>☰ {listLabel || t('اختر', 'Choose')}</span>
          </div>
        ) : (
          <div className="smart-bubble-choices">
            {choices.map((choice, i) => (
              <span key={i}>{choice}</span>
            ))}
          </div>
        ))}
    </div>
  );
}
export function DeliveryOptions({
  data,
  onChange,
}: {
  data: ChoiceData;
  onChange: (data: ChoiceData) => void;
}) {
  const { t } = useLocale();
  const seconds = Number(data.delivery?.delaySeconds) || 0;
  const set = (patch: Record<string, unknown>) =>
    onChange({ ...data, delivery: { delaySeconds: seconds, ...data.delivery, ...patch } });
  return (
    <div className={styles.form}>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={!!data.delivery?.typingSeconds}
          onChange={(e) =>
            set({ typingSeconds: e.target.checked ? Math.max(1, Math.min(5, seconds || 1)) : 0 })
          }
        />
        {t('إظهار مؤشر الكتابة قبل الرد', 'Show typing indicator before replying')}
      </label>
      <div className={styles.delayGrid}>
        {[
          [3600, 168, t('ساعات', 'Hours')],
          [60, 59, t('دقائق', 'Minutes')],
          [1, 59, t('ثوانٍ', 'Seconds')],
        ].map(([unit, max, label]) => {
          const u = Number(unit);
          const value =
            u === 3600
              ? Math.floor(seconds / 3600)
              : u === 60
                ? Math.floor(seconds / 60) % 60
                : seconds % 60;
          return (
            <label key={u} className={styles.field}>
              {label}
              <input
                type="number"
                min={0}
                max={Number(max)}
                value={value}
                onChange={(e) =>
                  set({
                    delaySeconds: Math.min(
                      604800,
                      Math.max(
                        0,
                        seconds -
                          value * u +
                          Math.max(0, Math.min(Number(max), Number(e.target.value) || 0)) * u,
                      ),
                    ),
                  })
                }
              />
            </label>
          );
        })}
      </div>
      {!!data.delivery?.typingSeconds && (
        <label className={styles.field}>
          {t('مدة مؤشر الكتابة (ثوانٍ)', 'Typing indicator duration (seconds)')}
          <input
            type="number"
            min={1}
            max={5}
            value={data.delivery.typingSeconds}
            onChange={(e) =>
              set({ typingSeconds: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })
            }
          />
        </label>
      )}
    </div>
  );
}
export default function MessageEditor({
  data,
  onChange,
  variables,
  actionSummary,
  onDrillChange,
  initialChoiceId,
  onChoiceSelect,
  interactive = false,
  view = 'message',
}: {
  view?: 'message' | 'choices';
  initialChoiceId?: string;
  onChoiceSelect?: (id: string | null) => void;
  interactive?: boolean;
  data: ChoiceData;
  onChange: (data: ChoiceData) => void;
  variables: ConditionVariable[];
  onDrillChange?: (open: boolean) => void;
  actionSummary?: (handle: string) => string;
}) {
  const { t } = useLocale();
  const input = useRef<HTMLTextAreaElement>(null);
  const caret = useRef({ start: 0, end: 0 });
  const [suggest, setSuggest] = useState(false);
  const [localChoice, setLocalChoice] = useState<string | null>(null);
  const [error, setError] = useState('');
  const selected = initialChoiceId ?? localChoice;
  const mode = data.list ? 'list' : data.buttons?.length ? 'buttons' : 'none';
  const groups = data.list?.sections ?? [{ rows: data.buttons ?? [] }];
  const choices = groups.flatMap((section) => section.rows);
  const active = choices.find((choice) => choice.id === selected);
  const hasInteractive = interactive || mode !== 'none' || !!data.header || !!data.footer;
  const set = (patch: any) => onChange({ ...data, ...patch });
  const focusChoice = (id: string | null) => {
    if (onChoiceSelect) onChoiceSelect(id);
    else setLocalChoice(id);
    onDrillChange?.(!!id);
  };
  const changeMode = (next: 'none' | 'buttons' | 'list') => {
    if (next === mode) return;
    if (
      next === 'buttons' &&
      data.list &&
      (groups.some((section) => section.title || section.rows.some((row) => row.description)) ||
        data.list.buttonText) &&
      !confirm(
        t(
          'الأزرار لا تعرض عناوين الأقسام وأوصاف الصفوف ونص القائمة. المعرّفات والوصلات محفوظة. متابعة؟',
          'Buttons do not display section headings, descriptions or menu text. IDs and links stay. Continue?',
        ),
      )
    )
      return;
    try {
      if (
        next === 'none' &&
        choices.length &&
        !confirm(
          t(
            'إزالة الاختيارات ووصلاتها؟ يمكنك التراجع.',
            'Remove choices and their links? You can undo.',
          ),
        )
      )
        return;
      const nextData = convertChoices(data, next);
      if (
        next !== 'none' &&
        !(
          nextData.buttons?.length || nextData.list?.sections.some((section) => section.rows.length)
        )
      ) {
        const first = { id: uid(), title: t('اختيار جديد', 'New Choice') };
        if (next === 'buttons') nextData.buttons = [first];
        else nextData.list = { buttonText: t('القائمة', 'Menu'), sections: [{ rows: [first] }] };
      }
      onChange(nextData);
      setError('');
    } catch {
      setError(
        t(
          'راجع حدود القناة: ثلاثة أزرار أو عشرة صفوف قائمة. لم نحذف أي اختيار.',
          'Check channel limits: three buttons or ten list rows. No choices were deleted.',
        ),
      );
    }
  };
  const updateRows = (index: number, rows: Choice[]) =>
    mode === 'list'
      ? set({
          list: {
            ...data.list,
            sections: groups.map((section, i) => (i === index ? { ...section, rows } : section)),
          },
        })
      : set({ buttons: rows });
  if (active)
    return (
      <div className={styles.form}>
        <div>
          <EditorSection
            title={
              mode === 'list'
                ? t('إعداد صف القائمة', 'List Row Setup')
                : t('إعداد الزر', 'Button Setup')
            }
            description={t(
              'العنوان الذي يظهر للمشترك عند اختيار هذا الرد.',
              'The label subscribers see when choosing this reply.',
            )}
          >
            <label className={styles.field}>
              {t('العنوان', 'Title')}
              <input
                maxLength={mode === 'list' ? 24 : 20}
                value={active.title}
                onChange={(e) => onChange(patchChoice(data, active.id, { title: e.target.value }))}
              />
              <span className={styles.counter}>
                {active.title.length}/{mode === 'list' ? 24 : 20}
              </span>
            </label>
            {mode === 'list' && (
              <label className={styles.field}>
                {t('وصف الصف', 'Row Description')}
                <textarea
                  maxLength={72}
                  rows={2}
                  value={active.description ?? ''}
                  onChange={(e) =>
                    onChange(patchChoice(data, active.id, { description: e.target.value }))
                  }
                />
              </label>
            )}
          </EditorSection>
        </div>
        <ConfigDisclosure open>
          <ConfigSummary>{t('الأتمتة', 'Automation')}</ConfigSummary>
          <ButtonActionsEditor
            value={active.actions as any}
            onChange={(actions) => onChange(patchChoice(data, active.id, { actions }))}
            defaultValue={active.title}
          />
        </ConfigDisclosure>
      </div>
    );
  if (view === 'choices')
    return (
      <div className={styles.form}>
        <EditorSection title={t('نوع الرد التفاعلي', 'Interactive Reply Type')}>
          <div className={styles.segmented}>
            {(['none', 'buttons', 'list'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={mode === kind}
                onClick={() => changeMode(kind)}
              >
                {kind === 'none'
                  ? t('بدون اختيارات', 'No Choices')
                  : kind === 'buttons'
                    ? t('أزرار', 'Buttons')
                    : t('قائمة', 'List')}
              </button>
            ))}
          </div>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          {mode === 'list' && (
            <label className={styles.field}>
              {t('عنوان زر فتح القائمة', 'List Button Title')}
              <input
                maxLength={20}
                value={data.list?.buttonText ?? ''}
                onChange={(e) => set({ list: { ...data.list, buttonText: e.target.value } })}
              />
            </label>
          )}
          {mode !== 'none' &&
            groups.map((group, groupIndex) => (
              <div key={groupIndex} className={styles.form}>
                {mode === 'list' && (
                  <label className={styles.field}>
                    {t('عنوان القسم', 'Section Title')}
                    <input
                      maxLength={24}
                      value={group.title ?? ''}
                      onChange={(e) =>
                        set({
                          list: {
                            ...data.list,
                            sections: groups.map((section, i) =>
                              i === groupIndex ? { ...section, title: e.target.value } : section,
                            ),
                          },
                        })
                      }
                    />
                  </label>
                )}
                {group.rows.map((choice, index) => (
                  <article key={choice.id} className={styles.choice}>
                    <div>
                      <div className={styles.choiceMain}>
                        <span className={styles.choiceNumber}>{index + 1}</span>
                        <input
                          aria-label={t('عنوان الاختيار', 'Choice Title')}
                          maxLength={mode === 'list' ? 24 : 20}
                          value={choice.title}
                          onChange={(e) =>
                            onChange(patchChoice(data, choice.id, { title: e.target.value }))
                          }
                        />
                      </div>
                      <p>{actionSummary?.(`option:${choice.id}`)}</p>
                    </div>
                    <div className={styles.choiceActions}>
                      <button
                        type="button"
                        aria-label={t('لأعلى', 'Move Up')}
                        disabled={index === 0}
                        onClick={() =>
                          updateRows(groupIndex, moveChoice(group.rows, choice.id, -1))
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={t('لأسفل', 'Move Down')}
                        disabled={index === group.rows.length - 1}
                        onClick={() => updateRows(groupIndex, moveChoice(group.rows, choice.id, 1))}
                      >
                        ↓
                      </button>
                      <button type="button" onClick={() => focusChoice(choice.id)}>
                        {t('إعداد', 'Configure')}
                      </button>
                      <button
                        type="button"
                        aria-label={t('حذف الاختيار', 'Remove Choice')}
                        onClick={() =>
                          updateRows(
                            groupIndex,
                            group.rows.filter((item) => item.id !== choice.id),
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  </article>
                ))}
                <button
                  type="button"
                  className={styles.button}
                  disabled={choices.length >= (mode === 'list' ? 10 : 3)}
                  onClick={() =>
                    updateRows(groupIndex, [
                      ...group.rows,
                      { id: uid(), title: t('اختيار جديد', 'New Choice') },
                    ])
                  }
                >
                  ＋ {mode === 'list' ? t('إضافة صف', 'Add Row') : t('إضافة زر', 'Add Button')}
                </button>
              </div>
            ))}
          {mode === 'list' && groups.length < 10 && choices.length < 10 && (
            <button
              type="button"
              className={styles.button}
              onClick={() =>
                set({
                  list: {
                    ...data.list,
                    sections: [
                      ...groups,
                      { title: '', rows: [{ id: uid(), title: t('اختيار جديد', 'New Choice') }] },
                    ],
                  },
                })
              }
            >
              ＋ {t('إضافة قسم', 'Add Section')}
            </button>
          )}
          {mode !== 'none' && (
            <label className={styles.field}>
              {t('حفظ اختيار المشترك في الحقل', 'Save Subscriber Choice to Field')}
              <input
                dir="ltr"
                value={data.saveReplyAs ?? ''}
                onChange={(e) => set({ saveReplyAs: e.target.value || undefined })}
              />
            </label>
          )}
        </EditorSection>
      </div>
    );
  return (
    <div className={styles.form}>
      <div className={styles.form}>
        {hasInteractive && (
          <EditorSection
            title={t('عنوان الرسالة', 'Message Header')}
            optional
            description={t(
              'نص أو وسائط تظهر أعلى الرسالة.',
              'Text or media shown at the top of the message.',
            )}
          >
            <label className={styles.field}>
              {t('نوع العنوان', 'Header Type')}
              <select
                value={data.header?.type ?? ''}
                onChange={(e) =>
                  set({
                    header:
                      e.target.value === 'text'
                        ? { type: 'text', text: '' }
                        : e.target.value
                          ? { type: e.target.value, url: '' }
                          : undefined,
                  })
                }
              >
                <option value="">{t('بدون عنوان', 'No Header')}</option>
                <option value="text">{t('نص', 'Text')}</option>
                <option value="image">{t('صورة', 'Image')}</option>
              </select>
            </label>
            {data.header && (
              <label className={styles.field}>
                {data.header.type === 'text'
                  ? t('نص العنوان', 'Header Text')
                  : t('رابط الوسائط', 'Media URL')}
                <input
                  dir={data.header.type === 'text' ? undefined : 'ltr'}
                  maxLength={data.header.type === 'text' ? 60 : 2000}
                  value={data.header.type === 'text' ? data.header.text : data.header.url}
                  onChange={(e) =>
                    set({
                      header: {
                        ...data.header,
                        [data.header.type === 'text' ? 'text' : 'url']: e.target.value,
                      },
                    })
                  }
                />
              </label>
            )}
          </EditorSection>
        )}
        <EditorSection
          title={
            hasInteractive ? t('نص الرسالة', 'Message Body') : t('رسالة الرد', 'Reply Message')
          }
          description={t(
            'المحتوى الرئيسي الذي يصل إلى المشترك.',
            'Main message content sent to the subscriber.',
          )}
        >
          <div className={styles.toolbar}>
            <button
              type="button"
              className={styles.button}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setSuggest((value) => !value)}
              aria-expanded={suggest}
            >
              {t('متغير مخصص', 'Custom Variable')} ＋
            </button>
            <button
              type="button"
              className={styles.button}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const result = insertToken(
                  data.text ?? '',
                  caret.current.start,
                  caret.current.end,
                  'contact.name',
                );
                set({ text: result.text });
              }}
            >
              {t('اسم المشترك', 'Name')}
            </button>
          </div>
          {suggest && (
            <div className={styles.variableList}>
              {[
                { key: 'contact.name', label: t('الاسم', 'Name') },
                { key: 'contact.phone', label: t('الهاتف', 'Phone') },
                { key: 'contact.email', label: t('البريد الإلكتروني', 'Email') },
                ...variables,
              ].map((variable) => (
                <button
                  key={variable.key}
                  type="button"
                  className={styles.button}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const result = insertToken(
                      data.text ?? '',
                      caret.current.start,
                      caret.current.end,
                      variable.key,
                    );
                    set({ text: result.text });
                    setSuggest(false);
                    requestAnimationFrame(() => {
                      input.current?.focus();
                      input.current?.setSelectionRange(result.caret, result.caret);
                    });
                  }}
                >
                  {variable.label}
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={input}
            className={styles.rich}
            rows={5}
            maxLength={hasInteractive ? 1024 : 4096}
            aria-label={t('رسالة الرد', 'Reply Message')}
            value={data.text ?? ''}
            onSelect={(e) => {
              caret.current = {
                start: e.currentTarget.selectionStart,
                end: e.currentTarget.selectionEnd,
              };
            }}
            onChange={(e) => {
              set({ text: e.target.value });
              caret.current = { start: e.target.selectionStart, end: e.target.selectionEnd };
            }}
          />
          <span className={styles.counter}>
            {(data.text ?? '').length}/{hasInteractive ? 1024 : 4096}
          </span>
        </EditorSection>
        {hasInteractive && (
          <EditorSection
            title={t('تذييل الرسالة', 'Message Footer')}
            optional
            description={t(
              'نص اختياري يظهر أسفل الرسالة.',
              'Optional text shown at the bottom of the message.',
            )}
          >
            <input
              aria-label={t('تذييل الرسالة', 'Message Footer')}
              maxLength={60}
              value={data.footer ?? ''}
              onChange={(e) => set({ footer: e.target.value || undefined })}
            />
            <span className={styles.counter}>{(data.footer ?? '').length}/60</span>
          </EditorSection>
        )}
        {data.media && (
          <EditorSection title={t('المرفق الحالي', 'Current Attachment')}>
            <label className={styles.field}>
              {t('نوع الوسائط', 'Media Type')}
              <select
                value={data.media.kind}
                onChange={(e) => set({ media: { ...data.media, kind: e.target.value } })}
              >
                {['image', 'video', 'audio', 'file'].map((kind) => (
                  <option key={kind}>{kind}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              {t('رابط الوسائط', 'Media URL')}
              <input
                dir="ltr"
                value={data.media.url}
                onChange={(e) => set({ media: { ...data.media, url: e.target.value } })}
              />
            </label>
            <label className={styles.field}>
              {t('التعليق', 'Caption')}
              <input
                value={data.media.caption ?? ''}
                onChange={(e) => set({ media: { ...data.media, caption: e.target.value } })}
              />
            </label>
          </EditorSection>
        )}
      </div>
      <ConfigDisclosure>
        <ConfigSummary>{t('خيارات الإرسال', 'Delivery Options')}</ConfigSummary>
        <DeliveryOptions data={data} onChange={onChange} />
      </ConfigDisclosure>
    </div>
  );
}
