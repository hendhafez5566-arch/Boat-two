'use client';
import { useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { Button } from '../product/ProductUI';
import styles from './crm-workspace.module.css';
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
    try {
      const form = new FormData();
      form.append('file', file);
      if (selectedSheet) form.append('sheet', selectedSheet);
      const result = await api<{ rows: string[][]; sheets: string[] }>(
        '/crm/workspace/import-preview',
        { method: 'POST', body: form },
      );
      setFile(file);
      setSheets(result.sheets);
      setSheet(selectedSheet || result.sheets[0]);
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
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const mapped = () =>
    rows
      .slice(1)
      .filter((row) => row.some((x) => x.trim()))
      .map((row) => {
        const cell = (key: string) => row[Number(mapping[key])] || '';
        return {
          name: cell('name').trim(),
          email: cell('email').trim() || null,
          phone: cell('phone').trim() || null,
          tags: cell('tags')
            .split(/[;|]/)
            .map((x) => x.trim())
            .filter(Boolean),
          attributes: { company: cell('company').trim(), source: cell('source').trim() },
        };
      });
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const contacts = mapped();
      if (!contacts.length || contacts.some((c) => !c.name || (!c.email && !c.phone)))
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
      const job = await api<{ id: string; uploaded: number }>('/crm/jobs/uploads', {
        method: 'POST',
        body: JSON.stringify({ total: contacts.length, fingerprint }),
      });
      for (let offset = job.uploaded; offset < contacts.length; offset += 100)
        await api(`/crm/jobs/${job.id}/upload`, {
          method: 'POST',
          body: JSON.stringify({ after: offset, rows: contacts.slice(offset, offset + 100) }),
        });
      await api(`/crm/jobs/${job.id}/complete-upload`, { method: 'POST' });
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
      <h2>{t('استيراد عملاء من Excel أو CSV', 'Import customers from Excel or CSV')}</h2>
      <p>
        {t(
          'ارفع الملف ← راجع الأعمدة ← ابدأ الاستيراد. لا يُعدّل أي عميل موجود.',
          'Upload → review columns → start import. Existing customers are never overwritten.',
        )}
      </p>
      <label>
        {t('اختر الملف (حتى 5 MB)', 'Choose file (up to 5 MB)')}
        <input
          type="file"
          accept=".csv,.xlsx"
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
      {!!rows.length && (
        <>
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
          <Button
            variant="primary"
            busy={busy}
            disabled={
              Number(mapping.name) < 0 || (Number(mapping.email) < 0 && Number(mapping.phone) < 0)
            }
            onClick={() => void submit()}
          >
            {t('تأكيد وبدء الاستيراد', 'Confirm and start import')}
          </Button>
        </>
      )}
    </section>
  );
}
