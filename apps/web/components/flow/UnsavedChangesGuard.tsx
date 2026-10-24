'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, Feedback } from '../product/ProductUI';
import { useLocale } from '../product/locale';

export default function UnsavedChangesGuard({ dirty, save }: {
  dirty: boolean; save: () => Promise<boolean>;
}) {
  const { t } = useLocale();
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = useRef({ dirty, save });
  current.current = { dirty, save };
  const allowed = useRef(false);
  useEffect(() => {
    const href = window.location.href;
    const state = window.history.state;
    const click = (event: MouseEvent) => {
      if (!current.current.dirty || allowed.current || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || link.download || (link.target && link.target !== '_self')) return;
      const next = new URL(link.href, href);
      if (next.origin === location.origin && next.pathname === location.pathname && next.search === location.search) return;
      if (!['http:', 'https:'].includes(next.protocol)) return;
      event.preventDefault(); event.stopPropagation();
      setError(''); setTarget(next.href);
    };
    const pop = (event: PopStateEvent) => {
      if (!current.current.dirty || allowed.current) return;
      const destination = location.href;
      if (destination === href) return;
      // Restore this document before Next's popstate listener can unmount the editor.
      event.stopImmediatePropagation();
      window.history.pushState(state, '', href);
      setError(''); setTarget(destination);
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (current.current.dirty && !allowed.current) { event.preventDefault(); event.returnValue = ''; }
    };
    document.addEventListener('click', click, true);
    window.addEventListener('popstate', pop, true);
    window.addEventListener('beforeunload', unload);
    return () => {
      document.removeEventListener('click', click, true);
      window.removeEventListener('popstate', pop, true);
      window.removeEventListener('beforeunload', unload);
    };
  }, []);
  const leave = () => { if (target) { allowed.current = true; window.location.assign(target); } };
  return <Dialog open={!!target} onClose={() => !busy && setTarget(null)} title={t('لديك تغييرات غير محفوظة', 'You have unsaved changes')}>
    <p>{t('احفظ تعديلاتك قبل المغادرة، أو تجاهلها، أو ابقَ لمتابعة العمل.', 'Save before leaving, discard changes, or keep editing.')}</p>
    {error && <Feedback error>{error}</Feedback>}
    <div className="flex gap-2 flex-wrap">
      <Button variant="primary" busy={busy} onClick={async () => {
        setBusy(true); setError('');
        try {
          if (await current.current.save()) leave();
          else setError(t('توجد تعديلات أحدث. احفظها قبل المغادرة.', 'Newer changes remain. Save them before leaving.'));
        } catch { setError(t('تعذر الحفظ. ما زالت تعديلاتك هنا، ويمكنك المحاولة مجددًا.', 'Save failed. Your changes remain here; try again.')); }
        finally { setBusy(false); }
      }}>{t('حفظ ومغادرة', 'Save and leave')}</Button>
      <Button disabled={busy} variant="danger" onClick={leave}>{t('تجاهل ومغادرة', 'Discard and leave')}</Button>
      <Button disabled={busy} onClick={() => setTarget(null)}>{t('إلغاء المغادرة', 'Keep editing')}</Button>
    </div>
  </Dialog>;
}
