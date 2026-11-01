'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useData } from './useData';
import { useLocale } from '../product/locale';
import { Button } from '../product/ProductUI';
import styles from './crm-workspace.module.css';
type Condition = {
  q?: string;
  tag?: string;
  lifecycle?: string;
  allOf?: Condition[];
  anyOf?: Condition[];
  archived?: string;
};
export function CrmSegments() {
  const { t } = useLocale();
  const [match, setMatch] = useState('allOf');
  const [rules, setRules] = useState<{ field: string; value: string }[]>([
    { field: 'tag', value: '' },
  ]);
  const [name, setName] = useState('');
  const [result, setResult] = useState<{
    total: number;
    items: { id: string; name: string }[];
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useData<{ id: string; name: string; filters: Condition }[]>(
    '/crm/workspace/views',
    [],
  );
  const conditions = () => ({
    [match]: rules.filter((r) => r.value.trim()).map((r) => ({ [r.field]: r.value.trim() })),
  });
  async function run(save: boolean, filter?: Condition) {
    setBusy(true);
    setError('');
    try {
      if (save) {
        await api('/crm/workspace/views', {
          method: 'POST',
          body: JSON.stringify({ name, conditions: conditions() }),
        });
        await list.reload();
      } else
        setResult(
          await api('/crm/workspace/search', {
            method: 'POST',
            body: JSON.stringify({ conditions: filter || conditions(), limit: 50 }),
          }),
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.card}>
      <h2>{t('الشرائح الذكية والعروض المحفوظة', 'Smart segments & saved views')}</h2>
      <div className={styles.form}>
        <label>
          {t('طريقة المطابقة', 'Match')}
          <select value={match} onChange={(e) => setMatch(e.target.value)}>
            <option value="allOf">{t('كل الشروط (AND)', 'All conditions (AND)')}</option>
            <option value="anyOf">{t('أي شرط (OR)', 'Any condition (OR)')}</option>
          </select>
        </label>
        {rules.map((r, i) => (
          <div key={i} className={styles.toolbar}>
            <select
              aria-label={t('حقل الشرط', 'Condition field')}
              value={r.field}
              onChange={(e) =>
                setRules((rs) =>
                  rs.map((x, n) => (n === i ? { field: e.target.value, value: '' } : x)),
                )
              }
            >
              <option value="tag">{t('وسم', 'Tag')}</option>
              <option value="q">
                {t('بحث الاسم أو الهاتف أو البريد', 'Name, phone or email search')}
              </option>
              <option value="lifecycle">{t('مرحلة العميل', 'Lifecycle')}</option>
            </select>
            {r.field === 'lifecycle' ? (
              <select
                value={r.value}
                aria-label={t('قيمة الشرط', 'Condition value')}
                onChange={(e) =>
                  setRules((rs) =>
                    rs.map((x, n) => (n === i ? { ...x, value: e.target.value } : x)),
                  )
                }
              >
                <option value="">—</option>
                {['lead', 'qualified', 'customer', 'inactive'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            ) : (
              <input
                aria-label={t('قيمة الشرط', 'Condition value')}
                maxLength={r.field === 'tag' ? 50 : 100}
                value={r.value}
                onChange={(e) =>
                  setRules((rs) =>
                    rs.map((x, n) => (n === i ? { ...x, value: e.target.value } : x)),
                  )
                }
              />
            )}
            <Button
              disabled={rules.length === 1}
              onClick={() => setRules((rs) => rs.filter((_, n) => n !== i))}
            >
              {t('إزالة شرط', 'Remove condition')}
            </Button>
          </div>
        ))}
        <div className={styles.actions}>
          <Button
            disabled={rules.length >= 10}
            onClick={() => setRules([...rules, { field: 'tag', value: '' }])}
          >
            {t('إضافة شرط', 'Add condition')}
          </Button>
          <Button busy={busy} onClick={() => void run(false)}>
            {t('عرض النتائج', 'Show results')}
          </Button>
        </div>
        <label>
          {t('اسم العرض', 'View name')}
          <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </label>
        <Button busy={busy} disabled={!name.trim()} onClick={() => void run(true)}>
          {t('حفظ العرض', 'Save view')}
        </Button>
      </div>
      {(error || list.error) && (
        <p role="alert" className="notice error">
          {error || list.error}
        </p>
      )}
      <div className={styles.actions}>
        {list.data.map((v) => (
          <Button key={v.id} busy={busy} onClick={() => void run(false, v.filters)}>
            {v.name}
          </Button>
        ))}
      </div>
      {result && (
        <>
          <p>
            {t('العدد الإجمالي — أول 50 نتيجة', 'Total — first 50 results')}: {result.total}
          </p>
          {result.items.map((c) => (
            <p key={c.id}>
              <Link href={`/dashboard/crm?contact=${c.id}`}>{c.name}</Link>
            </p>
          ))}
        </>
      )}
    </section>
  );
}
