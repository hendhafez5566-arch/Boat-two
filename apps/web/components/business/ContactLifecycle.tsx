'use client';
import { useState } from 'react';
import { useLocale } from '../product/locale';
export function ContactLifecycle({
  act,
  busy,
}: {
  act: (path: string, body?: unknown, method?: string) => Promise<unknown>;
  busy: boolean;
}) {
  const { t } = useLocale();
  const [target, setTarget] = useState('');
  return (
    <section className="card stack">
      <h2>{t('توحيد ملفات العملاء', 'Unify customer profiles')}</h2>
      <p>
        {t(
          'لا تُحذف البيانات الأصلية. تُحفظ سجلات الحملات، وتغلب حالة الانسحاب أي موافقة متعارضة. يُرفض تعارض هويات القناة حتى المراجعة.',
          'Original records are retained. Campaign history is preserved and opt-out wins consent conflicts. Conflicting channel identities require review.',
        )}
      </p>
      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          if (
            !confirm(
              t('تأكيد الدمج؟ لا يوجد تراجع آلي.', 'Confirm merge? Automatic undo is unavailable.'),
            )
          )
            return;
          try {
            await act('/crm/contacts/' + target + '/merge', {
              sourceId: data.get('source'),
              evidence: data.get('evidence'),
            });
          } catch {
            /* Parent shows error. */
          }
        }}
      >
        <label className="field">
          {t('معرّف العميل الأساسي', 'Target contact ID')}
          <input value={target} onChange={(e) => setTarget(e.target.value)} required />
        </label>
        <label className="field">
          {t('معرّف الملف المكرر', 'Duplicate contact ID')}
          <input name="source" required />
        </label>
        <label className="field">
          {t('سبب الدمج والتحقق', 'Merge reason and verification')}
          <textarea name="evidence" minLength={10} maxLength={1000} required />
        </label>
        <button className="btn btn-primary" disabled={busy}>
          {t('دمج الملفات', 'Merge profiles')}
        </button>
      </form>
    </section>
  );
}
