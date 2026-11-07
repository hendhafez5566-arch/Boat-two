'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { useData } from '../../../components/business/useData';
import { useLocale } from '../../../components/product/locale';
import { Dialog } from '../../../components/product/ProductUI';
import { NavIcon } from '../../../components/product/NavIcon';
import styles from './manager.module.css';

export type ManagerFlow = {
  id: string;
  name: string;
  folder_name: string | null;
  updated_at: string;
  channel_ids: string[];
};
type Tool = 'variables' | 'errors' | 'reset' | 'folder-create' | 'folders' | 'import';

/** Account-scoped tools. All writes use the existing flow API and revision checks. */
export default function ManagerTools({
  flows,
  channelId,
  reload,
  importFile,
  disabled,
}: {
  flows: ManagerFlow[];
  channelId: string;
  reload: () => Promise<void>;
  importFile: (file: File) => Promise<void>;
  disabled: boolean;
}) {
  const { t, language } = useLocale();
  const [open, setOpen] = useState(false);
  const [tool, setTool] = useState<Tool | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [flowId, setFlowId] = useState('');
  const [folderSearch, setFolderSearch] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const lock = useRef(false);
  const fields = useData<{ key: string; label: string; type: string }[]>(
    tool === 'variables' ? '/crm/fields' : null,
    [],
  );
  const logs = useData<{ id: string; status: string; error: string; updated_at: string }[]>(
    tool === 'errors' && flowId ? `/flows/${flowId}/errors` : null,
    [],
  );
  const accountFlows = flows.filter(
    (f) => !f.channel_ids?.length || f.channel_ids.includes(channelId),
  );
  const folders = [
    ...new Set(accountFlows.map((f) => f.folder_name).filter((f): f is string => !!f)),
  ].sort();
  const labels: Record<Tool, string> = {
    reset: t('إعادة تعيين إجراءات الأزرار', 'Reset Action Buttons'),
    variables: t('المتغيرات المتاحة', 'Available Variables'),
    errors: t('سجلات أخطاء البوت', 'Bot Error Logs'),
    import: t('استيراد تدفق', 'Flow Import'),
    'folder-create': t('إنشاء مجلد للتدفقات', 'Create Campaign Folder'),
    folders: t('قائمة المجلدات', 'Folder List'),
  };
  const items: [Tool, string, string][] = [
    ['reset', 'undo', labels.reset],
    ['variables', 'variable', t('المتغيرات المخصصة', 'Custom Variables')],
    ['errors', 'audit', labels.errors],
    ['import', 'export', labels.import],
    ['folder-create', 'folder', labels['folder-create']],
    ['folders', 'archive', t('إدارة قائمة المجلدات', 'Manage Folder List')],
  ];
  useEffect(() => {
    setOpen(false);
    setTool(null);
    setFlowId('');
  }, [channelId]);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  async function run(action: () => Promise<void>, close = true) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await action();
      if (close) setTool(null);
      setSuccess(t('تم حفظ التغييرات.', 'Changes saved.'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await reload();
      lock.current = false;
      setBusy(false);
    }
  }
  async function move(flow: ManagerFlow, folderName: string | null) {
    await api(`/flows/${flow.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ folderName, expectedUpdatedAt: flow.updated_at }),
    });
  }
  const close = () => {
    if (!busy) {
      setTool(null);
      trigger.current?.focus();
    }
  };
  return (
    <div className={styles.managerOptions} ref={root}>
      <button
        ref={trigger}
        type="button"
        className="btn"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        {t('خيارات', 'Options')}
        <NavIcon name="chevron" />
      </button>
      {open && (
        <div
          className={styles.optionsMenu}
          role="menu"
          aria-label={t('خيارات البوت', 'Bot options')}
          onKeyDown={(e) => {
            const buttons = Array.from(
              e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
            );
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            if (e.key === 'Escape') {
              e.preventDefault();
              setOpen(false);
              trigger.current?.focus();
            }
            if (e.key === 'Tab') setOpen(false);
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
              e.preventDefault();
              const next =
                e.key === 'Home'
                  ? 0
                  : e.key === 'End'
                    ? buttons.length - 1
                    : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
              buttons[next]?.focus();
            }
          }}
        >
          {items.map(([id, icon, label]) => (
            <button
              type="button"
              role="menuitem"
              key={id}
              onClick={() => {
                setOpen(false);
                setError('');
                setSuccess('');
                setFlowId('');
                setTool(id);
              }}
            >
              <NavIcon name={icon} />
              {label}
            </button>
          ))}
        </div>
      )}
      {success && (
        <span className={styles.toolFeedback} role="status">
          {success}
        </span>
      )}
      <Dialog
        open={tool !== null}
        onClose={close}
        title={tool ? labels[tool] : ''}
        className={styles.managerDialog}
      >
        <div className={styles.form} dir={language === 'ar' ? 'rtl' : 'ltr'}>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {tool === 'variables' && (
            <>
              <h3>{t('كيفية استخدام المتغيرات؟', 'How to use variables?')}</h3>
              <p>
                {t(
                  'تُحفظ الإجابات في حقول العميل. استخدم مفتاح الحقل بهذه الصيغة داخل رسائل البوت:',
                  'Answers are saved in customer fields. Use the field key in bot messages with this syntax:',
                )}{' '}
                <code dir="ltr">{'{{field_key}}'}</code>
              </p>
              {fields.loading ? (
                <p role="status">{t('جارٍ التحميل…', 'Loading…')}</p>
              ) : fields.error ? (
                <p role="alert">{fields.error}</p>
              ) : (
                <ul className={styles.variableList}>
                  {fields.data.map((f) => (
                    <li key={f.key}>
                      <strong>{f.label}</strong>
                      <code dir="ltr">{`{{${f.key}}}`}</code>
                      <small>{f.type}</small>
                    </li>
                  ))}
                </ul>
              )}
              {!fields.loading && !fields.error && !fields.data.length && (
                <p>{t('لا توجد حقول مخصصة بعد.', 'No custom fields yet.')}</p>
              )}
            </>
          )}
          {(tool === 'errors' || tool === 'reset') && (
            <>
              <label>
                {t('اختر تدفقًا', 'Select a flow')}
                <select
                  value={flowId}
                  onChange={(e) => {
                    setFlowId(e.target.value);
                    setError('');
                  }}
                >
                  <option value="">{t('اختر', 'Select')}</option>
                  {accountFlows.map((f) => (
                    <option value={f.id} key={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              {tool === 'errors' && flowId && (
                <div aria-busy={logs.loading} key={flowId}>
                  {logs.loading ? (
                    <p role="status">{t('جارٍ تحميل الأخطاء…', 'Loading errors…')}</p>
                  ) : logs.error ? (
                    <p role="alert">{logs.error}</p>
                  ) : logs.data.length ? (
                    <ul className={styles.variableList}>
                      {logs.data.map((log) => (
                        <li key={log.id}>
                          <time dateTime={log.updated_at}>
                            {new Date(log.updated_at).toLocaleString(
                              language === 'ar' ? 'ar-EG' : 'en-GB',
                            )}
                          </time>
                          <span>{log.status}</span>
                          <p>{log.error}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      {t('لا توجد أخطاء مسجلة لهذا التدفق.', 'No recorded errors for this flow.')}
                    </p>
                  )}
                  <button type="button" className="btn" onClick={() => void logs.reload()}>
                    {t('تحديث', 'Refresh')}
                  </button>
                </div>
              )}
              {tool === 'reset' && (
                <>
                  <p>
                    {t(
                      'يزيل إجراءات الأزرار والقوائم من مسودة التدفق المحدد. النسخة المنشورة لن تتغير حتى تعيد نشرها من المصمم.',
                      'Removes button and list actions from the selected draft. The published version stays active until you publish the draft in the builder.',
                    )}
                  </p>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy || !flowId}
                    onClick={() =>
                      void run(async () => {
                        const current = accountFlows.find((f) => f.id === flowId);
                        if (!current) throw new Error(t('التدفق غير متاح.', 'Flow unavailable.'));
                        await api(`/flows/${flowId}/reset-actions`, {
                          method: 'POST',
                          body: JSON.stringify({
                            confirm: true,
                            expectedUpdatedAt: current.updated_at,
                          }),
                        });
                      })
                    }
                  >
                    {busy ? t('جارٍ الحفظ…', 'Saving…') : t('تأكيد إعادة التعيين', 'Confirm reset')}
                  </button>
                </>
              )}
            </>
          )}
          {tool === 'import' && (
            <>
              <p>
                {t(
                  'اختر ملف Boat Two بصيغة JSON، بحد أقصى 1 ميجابايت. سيتم استيراده كمسودة.',
                  'Choose a Boat Two JSON file up to 1 MB. It will be imported as a draft.',
                )}
              </p>
              <input
                type="file"
                accept="application/json,.json"
                disabled={busy}
                aria-label={t('ملف التدفق', 'Flow file')}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void run(() => importFile(file));
                }}
              />
            </>
          )}
          {tool === 'folder-create' && (
            <form
              className={styles.form}
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget),
                  name = String(data.get('name') || '').trim(),
                  ids = data.getAll('flows').map(String);
                if (!name || !ids.length) {
                  setError(
                    t(
                      'أدخل اسم المجلد واختر تدفقًا واحدًا على الأقل.',
                      'Enter a folder name and select at least one flow.',
                    ),
                  );
                  return;
                }
                void run(async () => {
                  for (const f of accountFlows.filter((f) => ids.includes(f.id)))
                    await move(f, name);
                });
              }}
            >
              <label>
                {t('اسم المجلد', 'Folder Name')}
                <input name="name" required pattern=".*\S.*" maxLength={80} />
              </label>
              <fieldset className={styles.flowPicker}>
                <legend>{t('اختر التدفقات', 'Select Campaigns')}</legend>
                {accountFlows.map((f) => (
                  <label key={f.id}>
                    <input type="checkbox" name="flows" value={f.id} />
                    {f.name}
                  </label>
                ))}
              </fieldset>
              <p>
                {t(
                  'اختر تدفقًا واحدًا على الأقل؛ تُحفظ المجلدات مع التدفقات الموجودة.',
                  'Select at least one flow; folders are stored with existing flows.',
                )}
              </p>
              <button className="btn btn-primary" disabled={busy || !accountFlows.length}>
                {t('إنشاء المجلد', 'Create Folder')}
              </button>
            </form>
          )}
          {tool === 'folders' && (
            <>
              <label>
                {t('بحث في المجلدات', 'Search folders')}
                <input
                  type="search"
                  value={folderSearch}
                  onChange={(e) => setFolderSearch(e.target.value)}
                />
              </label>
              {folders
                .filter((f) => f.toLocaleLowerCase().includes(folderSearch.toLocaleLowerCase()))
                .map((name) => (
                  <form
                    key={name}
                    className={styles.folderRow}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const next = String(new FormData(e.currentTarget).get('name') || '').trim();
                      if (next && next !== name)
                        void run(async () => {
                          for (const f of accountFlows.filter((f) => f.folder_name === name))
                            await move(f, next);
                        }, false);
                    }}
                  >
                    <label>
                      {t('اسم المجلد', 'Folder Name')}
                      <input name="name" defaultValue={name} required maxLength={80} />
                    </label>
                    <span>
                      {accountFlows.filter((f) => f.folder_name === name).length}{' '}
                      {t('تدفق', 'flows')}
                    </span>
                    <button className="btn" disabled={busy}>
                      {t('حفظ', 'Save')}
                    </button>
                  </form>
                ))}
              {!folders.length && <p>{t('لا توجد مجلدات.', 'No folders.')}</p>}
              <p>
                {t(
                  'لإزالة مجلد، انقل تدفقاته إلى «دون مجلد». لا تُحذف التدفقات.',
                  'To remove a folder, move its flows to Unfiled. Flows are retained.',
                )}
              </p>
            </>
          )}
          <div className={styles.dialogFooter}>
            <button type="button" className="btn" disabled={busy} onClick={close}>
              {t('إغلاق', 'Close')}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
