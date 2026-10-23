'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
type Audit = {
  id: string;
  run_id: string;
  tool_index: number;
  tool_name: string;
  input_hash: string;
  outcome: string;
  resource_id: string | null;
  created_at: string;
};
export function AiToolAudit() {
  const { t } = useLocale(),
    [rows, setRows] = useState<Audit[]>([]),
    [outcome, setOutcome] = useState('all'),
    [run, setRun] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [more, setMore] = useState(false);
  async function load(older = false) {
    setBusy(true);
    setError('');
    try {
      const q = new URLSearchParams({
        outcome,
        ...(run ? { runId: run } : {}),
        ...(older && rows.length ? { cursor: rows[rows.length - 1].id } : {}),
      });
      const page = await api<Audit[]>('/agents/tool-audits?' + q);
      setRows(older ? [...rows, ...page] : page);
      setMore(page.length === 100);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const labels: Record<string, string> = {
    all: t('الكل', 'All'),
    applied: t('نُفّذ', 'Applied'),
    noop: t('بلا تغيير', 'No change'),
    denied: t('مرفوض', 'Denied'),
    invalid: t('مدخلات غير صالحة', 'Invalid input'),
    limit: t('تجاوز حد الأدوات', 'Tool limit'),
    failed: t('فشل آمن', 'Failed safely'),
  };
  return (
    <section className="card stack">
      <h2>{t('تدقيق أدوات المساعد', 'Assistant tool audit')}</h2>
      <p className="muted">
        {t(
          'يسجّل قرارات الصلاحيات والمدخلات غير الصالحة وحد التنفيذ ونتائج تغييرات CRM. تحفظ بصمة المدخلات دون نص العميل. التحويل المسجل هو طلب تحويل؛ يُنفّذ مسار المحادثة الخطوة التالية.',
          'Records permission decisions, invalid input, action limits and CRM results. Input hashes are stored without customer text. A logged handoff represents a request; the conversation workflow performs the next step.',
        )}
      </p>
      <form
        className="form-actions"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          {t('النتيجة', 'Outcome')}
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {Object.entries(labels).map(([key, value]) => (
              <option value={key} key={key}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('معرّف التشغيل (اختياري)', 'Run ID (optional)')}
          <input value={run} onChange={(e) => setRun(e.target.value)} maxLength={36} />
        </label>
        <button className="btn" disabled={busy}>
          {t('بحث وتحديث', 'Search and refresh')}
        </button>
      </form>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {rows.map((r) => (
        <article key={r.id} className="card">
          <strong>
            {r.tool_name} · {labels[r.outcome] ?? r.outcome}
          </strong>
          <p>
            {new Date(r.created_at).toLocaleString()} · {t('تشغيل', 'Run')}: <code>{r.run_id}</code>{' '}
            · #{r.tool_index + 1}
          </p>
          <p className="muted break-all">SHA-256: {r.input_hash}</p>
          {r.resource_id && (
            <p>
              {t('السجل الناتج', 'Resulting record')}: <code>{r.resource_id}</code>
            </p>
          )}
        </article>
      ))}
      {more && (
        <button className="btn" disabled={busy} onClick={() => load(true)}>
          {t('تحميل الأقدم', 'Load older')}
        </button>
      )}
    </section>
  );
}
