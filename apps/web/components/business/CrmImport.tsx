'use client';
import { useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { Button } from '../product/ProductUI';
import styles from './crm-workspace.module.css';
import { parseCsvRows } from './csv';
const fields = [
  ['name', 'الاسم', 'Name'],
  ['email', 'البريد الإلكتروني', 'Email'],
  ['phone', 'الهاتف', 'Phone'],
  ['company', 'الشركة', 'Company'],
  ['source', 'المصدر', 'Source'],
  ['tags', 'الوسوم', 'Tags'],
] as const;
const aliases: Record<string, string[]> = {
  name: ['name', 'fullname', 'الاسم', 'اسم العميل'],
  email: ['email', 'البريد الإلكتروني', 'البريد'],
  phone: ['phone', 'mobile', 'whatsapp', 'الهاتف', 'الموبايل'],
  company: ['company', 'organization', 'الشركة'],
  source: ['source', 'المصدر'],
  tags: ['tags', 'labels', 'الوسوم'],
};
export function CrmImport() {
  const { t } = useLocale();
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [jsonContacts, setJsonContacts] = useState<Record<string, unknown>[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [upload, setUpload] = useState<{ fingerprint: string; id: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheet, setSheet] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  async function load(file: File, selectedSheet = '') {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    setRows([]);
    setJsonContacts([]);
    setProgress(null);
    if (selectedSheet) setSheet(selectedSheet);
    else {
      setSheets([]);
      setSheet('');
      setFile(null);
    }
    try {
      if (/\.json$/i.test(file.name)) {
        if (file.size > 10000000) throw Error(t('حد الملف 10MB.', 'File limit is 10MB.'));
        const parsed: unknown = JSON.parse(await file.text());
        if (!Array.isArray(parsed) || !parsed.length || parsed.length > 10000 ||
          parsed.some((row) => !row || typeof row !== 'object' || typeof row.name !== 'string' || !row.name.trim()))
          throw Error(t('يجب أن يحتوي الملف على 1–10,000 عميل بأسماء صالحة.', 'Choose 1–10,000 named customers.'));
        setJsonContacts(parsed.map((row) => ({
          ...row,
          email: row.email || null,
          phone: row.phone || null,
          tags: Array.isArray(row.tags) ? row.tags : String(row.tags || '').split(/[;|]/).filter(Boolean),
        })));
        return;
      }
      let result: { rows: string[][]; sheets: string[]; selectedSheet?: string };
      if (/\.csv$/i.test(file.name)) {
        if (file.size > 10000000) throw Error(t('حد الملف 10MB.', 'File limit is 10MB.'));
        const text = await file.text();
        if (text.includes('\0')) throw Error(t('استخدم CSV بترميز UTF-8.', 'Use UTF-8 CSV.'));
        const parsed = parseCsvRows(text);
        if (!parsed[0]?.some((cell) => cell.trim())) throw Error('The selected sheet has no column headers');
        if (parsed.length > 10001) throw Error(t('الحد الأقصى 10,000 عميل.', 'Import up to 10,000 customers.'));
        result = { rows: parsed, sheets: ['CSV'], selectedSheet: 'CSV' };
      } else {
        const form = new FormData();
        form.append('file', file);
        if (selectedSheet) form.append('sheet', selectedSheet);
        result = await api('/crm/workspace/import-preview', { method: 'POST', body: form });
      }
      setFile(file);
      setSheets(result.sheets);
      setSheet(result.selectedSheet || selectedSheet || result.sheets[0]);
      setRows(result.rows);
      setMapping(
        Object.fromEntries(
          fields.map(([key]) => [
            key,
            String(result.rows[0].findIndex((h) => aliases[key].includes(h.trim().toLowerCase()))),
          ]),
        ),
      );
    } catch (e) {
      const message = (e as Error).message;
      setError(
        /worksheet is empty|no worksheets|no column headers/i.test(message)
          ? t(
              'لا توجد أعمدة في هذه الورقة. اختر ورقة أخرى أو أضف رؤوس الأعمدة والبيانات.',
              'This sheet has no columns. Choose another sheet or add headers and data.',
            )
          : message,
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const mapped = rows
    .slice(1)
    .map((row, index) => {
      const canonicalValue = (key: string) => row[rows[0].findIndex((header) => header.trim() === key)]?.trim();
      const lifecycle = canonicalValue('lifecycle');
      const ownerId = canonicalValue('ownerId');
      const cell = (key: string) => row[Number(mapping[key])] || '';
      return {
        rowNumber: index + 2,
        blank: row.every((value) => !value.trim()),
        contact: {
          name: cell('name').trim(),
          ...(lifecycle ? { lifecycle } : {}),
          ...(ownerId ? { ownerId } : {}),
          email: cell('email').trim() || null,
          phone: cell('phone').trim() || null,
          tags: cell('tags')
            .split(/[;|]/)
            .map((x) => x.trim())
            .filter(Boolean),
          attributes: { company: cell('company').trim(), source: cell('source').trim() },
        },
      };
    })
    .filter((row) => !row.blank);
  const requiresIdentity = !/\.csv$/i.test(file?.name ?? '');
  const invalidRows = mapped.filter(
    ({ contact }) =>
      !contact.name ||
      (requiresIdentity && !contact.email && !contact.phone) ||
      (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)),
  );
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const contacts = jsonContacts.length ? jsonContacts : mapped.map(({ contact }) => contact);
      if (!contacts.length || invalidRows.length)
        throw Error(
          t(
            'كل صف يحتاج اسمًا وبريدًا أو هاتفًا لمنع التكرار.',
            'Every row needs a name and email or phone for duplicate detection.',
          ),
        );
      const bytes = new TextEncoder().encode(JSON.stringify(contacts));
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const fingerprint = Array.from(new Uint8Array(digest))
        .map((n) => n.toString(16).padStart(2, '0'))
        .join('');
      const resumeKey = 'boat:crm-upload:' + fingerprint;
      let resume = upload?.fingerprint === fingerprint ? upload.id : undefined;
      try {
        resume ||= sessionStorage.getItem(resumeKey) || undefined;
      } catch {
        // The in-memory receipt still supports retries when storage is unavailable.
      }
      const job = await api<{ id: string; uploaded: number; status: string }>('/crm/jobs/uploads', {
        method: 'POST',
        body: JSON.stringify({ total: contacts.length, fingerprint, ...(resume ? { resume } : {}) }),
      });
      setUpload({ id: job.id, fingerprint });
      try {
        sessionStorage.setItem(resumeKey, job.id);
      } catch {
        // The open importer retains the receipt.
      }
      let offset = job.uploaded;
      setProgress({ done: offset, total: contacts.length });
      while (offset < contacts.length) {
        let rows = contacts.slice(offset, offset + 100);
        while (new TextEncoder().encode(JSON.stringify({ after: offset, rows })).byteLength > 900000) {
          if (rows.length === 1)
            throw Error(t('صف واحد يتجاوز حد الطلب.', 'One row exceeds the request limit.'));
          rows = rows.slice(0, Math.ceil(rows.length / 2));
        }
        const result = await api<{ uploaded: number }>(`/crm/jobs/${job.id}/upload`, {
          method: 'POST',
          body: JSON.stringify({ after: offset, rows }),
        });
        if (result.uploaded <= offset || result.uploaded > contacts.length)
          throw Error(t('تعذّر تقدم الرفع. أعد المحاولة.', 'Upload did not advance. Try again.'));
        offset = result.uploaded;
        setProgress({ done: offset, total: contacts.length });
      }
      await api(`/crm/jobs/${job.id}/complete-upload`, { method: 'POST' });
      setUpload(null);
      try {
        sessionStorage.removeItem(resumeKey);
      } catch {
        // Nothing to clear when storage is unavailable.
      }
      setJsonContacts([]);
      setNotice(
        t(
          'تم تجهيز الاستيراد. تابع النتائج والأخطاء في المهام أدناه؛ السجلات المكررة لا تُستبدل.',
          'Import queued. Follow results and row errors in jobs below; duplicates are never overwritten.',
        ),
      );
      setRows([]);
      window.dispatchEvent(new Event('boat:crm-jobs'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className={styles.card}>
      <h2>{t('استيراد عملاء من Excel أو CSV أو JSON', 'Import customers from Excel, CSV or JSON')}</h2>
      <label>
        {t('اختر الملف (Excel حتى 5 MB، CSV وJSON حتى 10 MB)', 'Choose file (Excel up to 5 MB, CSV and JSON up to 10 MB)')}
        <input
          type="file"
          accept=".csv,.xlsx,.json"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void load(f);
            e.target.value = '';
          }}
        />
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
      {progress && <progress aria-label={t('تقدم رفع العملاء', 'Contact upload progress')} value={progress.done} max={progress.total} />}
      {jsonContacts.length > 0 && (
        <div>
          <p>{jsonContacts.length} {t('عميل', 'customers')}</p>
          <Button busy={busy} onClick={() => void submit()}>
            {t('تأكيد وبدء الاستيراد', 'Confirm and start import')}
          </Button>
        </div>
      )}
      {sheets.length > 1 && (
        <label>
          {t('ورقة العمل', 'Worksheet')}
          <select
            disabled={busy}
            value={sheet}
            onChange={(e) => {
              if (file) void load(file, e.target.value);
            }}
          >
            {sheets.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      )}
      {!!rows.length && (
        <>
          <div className={styles.grid}>
            {fields.map(([key, ar, en]) => (
              <label key={key}>
                {t(ar, en)}
                <select
                  aria-label={t(ar, en) + ' ' + t('عمود', 'column')}
                  disabled={busy}
                  value={mapping[key]}
                  onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
                >
                  <option value="-1">{t('غير مستخدم', 'Not used')}</option>
                  {rows[0].map((h, i) => (
                    <option key={i} value={i}>
                      {h || String(i + 1)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <h3>
            {t('معاينة أول خمسة عملاء', 'First five customers preview')} · {rows.length - 1}
          </h3>
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {fields.map(([key, ar, en]) => (
                    <th key={key}>{t(ar, en)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(1, 6).map((r, i) => (
                  <tr key={i}>
                    {fields.map(([key]) => (
                      <td key={key}>{r[Number(mapping[key])] || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {invalidRows.length > 0 && (
            <div className="notice error" role="alert">
              <strong>
                {t('صفوف تحتاج مراجعة قبل الاستيراد', 'Rows to review before import')} ·{' '}
                {invalidRows.length}
              </strong>
              <ul>
                {invalidRows.slice(0, 10).map(({ rowNumber, contact }) => (
                  <li key={rowNumber}>
                    {t('صف', 'Row')} {rowNumber}:{' '}
                    {!contact.name
                      ? t('الاسم مطلوب', 'Name required')
                      : requiresIdentity && !contact.email && !contact.phone
                        ? t('البريد أو الهاتف مطلوب', 'Email or phone required')
                        : t('البريد غير صالح', 'Invalid email')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button
            variant="primary"
            busy={busy}
            disabled={!mapped.length || invalidRows.length > 0}
            onClick={() => void submit()}
          >
            {t('تأكيد وبدء الاستيراد', 'Confirm and start import')}
          </Button>
        </>
      )}
    </section>
  );
}
