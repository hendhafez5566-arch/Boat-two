'use client';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
type Entry = {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  created_at: string;
  actor_name: string | null;
};
export default function Audit() {
  const { t } = useLocale();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Entry[]; total: number }>({ items: [], total: 0 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api<typeof data>('/workspace/audit?page=' + page)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page]);
  return (
    <main>
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKSPACE ACTIVITY</p>
          <h1>{t('سجل النشاط', 'Activity log')}</h1>
          <p>
            {t(
              'عمليات إعداد الشركة والفريق والقنوات والسيناريوهات، دون محتوى الرسائل أو الأسرار.',
              'Workspace, team, channel and flow changes, without message contents or secrets.',
            )}
          </p>
        </div>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="card table-wrap">
        <table className="product-table">
          <thead>
            <tr>
              <th>{t('الوقت', 'Time')}</th>
              <th>{t('الإجراء', 'Action')}</th>
              <th>{t('القسم', 'Resource')}</th>
              <th>{t('بواسطة', 'Actor')}</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((x) => (
              <tr key={x.id}>
                <td>{new Date(x.created_at).toLocaleString()}</td>
                <td>{x.action}</td>
                <td>
                  {x.resource_type}
                  <small className="muted block">{x.resource_id}</small>
                </td>
                <td>
                  {x.actor_name || t('النظام / قبل تفعيل سجل المستخدم', 'System / unattributed')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? (
          <p className="empty">{t('جارٍ التحميل…', 'Loading…')}</p>
        ) : (
          !data.items.length && (
            <p className="empty">
              {t('ستظهر الأنشطة الجديدة هنا.', 'New activities will appear here.')}
            </p>
          )
        )}
        <div className="form-actions">
          <button
            className="btn"
            disabled={page === 1 || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            {t('السابق', 'Previous')}
          </button>
          <span>
            {page} / {Math.max(1, Math.ceil(data.total / 25))}
          </span>
          <button
            className="btn"
            disabled={page * 25 >= data.total || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('التالي', 'Next')}
          </button>
        </div>
      </div>
    </main>
  );
}
