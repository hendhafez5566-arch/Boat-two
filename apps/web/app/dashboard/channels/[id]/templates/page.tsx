'use client';
import { useState } from 'react';
import { api } from '../../../../../lib/api';
import { useLocale } from '../../../../../components/product/locale';
import { useData } from '../../../../../components/business/useData';
export default function Templates({ params }: { params: { id: string } }) {
  const { t } = useLocale();
  const path = `/channels/${params.id}/templates`;
  const data = useData<
    {
      id: string;
      name: string;
      language: string;
      category: string;
      body: string;
      status: string;
      supported: boolean;
      error: string | null;
    }[]
  >(path, []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function act(url: string, body?: unknown) {
    setBusy(true);
    setError('');
    try {
      await api(url, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      data.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">WHATSAPP TEMPLATES</p>
          <h1>
            {t('قوالب رسمية، بحالة اعتماد واضحة', 'Official templates, explicit approval status')}
          </h1>
          <p>
            {t(
              'المسودة ليست قالبًا معتمدًا. تتم الموافقة لدى Meta ثم تُزامن حالتها هنا.',
              'A draft is not an approved template. Meta approves it; synchronization imports its status.',
            )}
          </p>
        </div>
        <button className="btn" disabled={busy} onClick={() => act(path + '/sync')}>
          {t('مزامنة من Meta', 'Sync from Meta')}
        </button>
      </div>
      {(error || data.error) && <p className="notice error">{error || data.error}</p>}
      <p className="notice">
        {t(
          'المزامنة والتقديم يحتاجان WABA ID وصلاحيات Meta وتفعيل الوصول الخارجي بواسطة المشغّل. لا تُرسل القوالب من هذه الصفحة.',
          'Sync and submission require a WABA ID, Meta permissions and operator-enabled external access. This page does not send messages.',
        )}
      </p>
      <div className="card-grid">
        {data.data.map((x) => (
          <section className="card" key={x.id}>
            <span className="badge">{x.status}</span>
            {!x.supported && (
              <p className="notice">
                {t(
                  'نوع القالب يحتاج دعم مكونات إضافية قبل إرساله.',
                  'This variant needs additional component support before it can be sent.',
                )}
              </p>
            )}
            <h2 className="mt-3">{x.name}</h2>
            <p className="muted">
              {x.language} · {x.category}
            </p>
            <p className="my-3 whitespace-pre-wrap">{x.body}</p>
            {x.status === 'DRAFT' && (
              <button
                className="btn"
                disabled={busy}
                onClick={() => act(path + '/' + x.id + '/submit')}
              >
                {t('تقديم للموافقة لدى Meta', 'Submit for Meta approval')}
              </button>
            )}
          </section>
        ))}
      </div>
      {!data.loading && !data.data.length && (
        <p className="empty">
          {t('أنشئ مسودة أو زامن القوالب المعتمدة.', 'Create a draft or sync approved templates.')}
        </p>
      )}
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          act(path, {
            name: f.get('name'),
            language: f.get('language'),
            category: f.get('category'),
            body: f.get('body'),
            examples: String(f.get('examples') || '')
              .split('\n')
              .filter(Boolean),
          });
        }}
      >
        <h2>{t('مسودة قالب نصي جديد', 'New text template draft')}</h2>
        <div className="form-grid">
          <label className="field">
            {t('معرّف إنجليزي صغير', 'Lowercase identifier')}
            <input name="name" pattern="[a-z0-9_]+" required />
          </label>
          <label className="field">
            {t('اللغة', 'Language')}
            <input name="language" defaultValue="ar" required />
          </label>
          <label className="field">
            {t('التصنيف', 'Category')}
            <select name="category">
              <option>UTILITY</option>
              <option>MARKETING</option>
            </select>
          </label>
        </div>
        <label className="field mt-4">
          {t('النص: المتغيرات بالشكل {{1}}', 'Text: variables use {{1}}')}
          <textarea required name="body" maxLength={1024} rows={4} />
        </label>
        <label className="field mt-4">
          {t('مثال لكل متغير، سطر لكل مثال', 'One example per variable, one per line')}
          <textarea name="examples" rows={3} />
        </label>
        <button className="btn btn-primary mt-4" disabled={busy}>
          {t('حفظ المسودة', 'Save draft')}
        </button>
      </form>
    </main>
  );
}
