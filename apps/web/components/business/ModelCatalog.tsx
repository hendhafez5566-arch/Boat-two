'use client';
import { useLocale } from '../product/locale';
import { useData } from './useData';
type Version = {
  id: string;
  provider_name: string;
  kind: string;
  model: string;
  revision: number;
  supports_tools: boolean;
  context_token_limit: number;
  max_output_tokens: number;
  input_rate_microusd: string | null;
  output_rate_microusd: string | null;
};
export function ModelCatalog() {
  const { t } = useLocale();
  const models = useData<Version[]>('/agents/models', []);
  return (
    <section className="card stack table-wrap">
      <h2>{t('كتالوج قدرات النماذج وإصدارات التسعير', 'Model capabilities & pricing history')}</h2>
      <p className="muted">
        {t(
          'آخر 500 إصدار محفوظ. الإعدادات يحددها مسؤول الشركة؛ كل تغيير يحفظ إصدارًا ثابتًا للاستدعاءات التالية، ولا يغير تسعير الاستدعاءات السابقة.',
          'Latest 500 saved versions. Workspace administrators declare these settings. Changes create immutable versions for subsequent calls; past call pricing is preserved.',
        )}
      </p>
      {models.error && (
        <p role="alert" className="notice error">
          {models.error}
        </p>
      )}
      {models.loading ? (
        <p>{t('جارٍ التحميل…', 'Loading…')}</p>
      ) : (
        <table className="product-table">
          <thead>
            <tr>
              <th>{t('المزود والنموذج', 'Provider & model')}</th>
              <th>{t('الإصدار', 'Revision')}</th>
              <th>{t('الأدوات', 'Tools')}</th>
              <th>{t('السياق / الرد', 'Context / reply')}</th>
              <th>
                {t('دولار لكل مليون رمز إدخال / إخراج', 'USD per million input / output tokens')}
              </th>
            </tr>
          </thead>
          <tbody>
            {models.data.map((v) => (
              <tr key={v.id}>
                <td>
                  {v.provider_name}
                  <small className="block" dir="ltr">
                    {v.kind} · {v.model}
                  </small>
                </td>
                <td>{v.revision}</td>
                <td>
                  {v.supports_tools ? t('مدعومة', 'Supported') : t('غير مدعومة', 'Unsupported')}
                </td>
                <td>
                  {v.context_token_limit} / {v.max_output_tokens}
                </td>
                <td>
                  {v.input_rate_microusd == null ? '—' : Number(v.input_rate_microusd) / 1000000} /{' '}
                  {v.output_rate_microusd == null ? '—' : Number(v.output_rate_microusd) / 1000000}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!models.loading && !models.data.length && (
        <p className="empty">
          {t('أضف مزودًا لبدء كتالوج النماذج.', 'Add a provider to start the model catalog.')}
        </p>
      )}
    </section>
  );
}
