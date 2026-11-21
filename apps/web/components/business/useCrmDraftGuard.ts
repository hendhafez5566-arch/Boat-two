'use client';

import { useEffect } from 'react';

export function useCrmDraftGuard(dirty: boolean, prompt: string, onDiscard: () => void) {
  useEffect(() => {
    if (!dirty) return;
    function preventLeave(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    function confirmLink(event: MouseEvent) {
      const link = (event.target as Element | null)?.closest('a[href]');
      if (
        !(link instanceof HTMLAnchorElement) ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        link.target === '_blank' ||
        link.hasAttribute('download') ||
        !/^https?:$/.test(link.protocol) ||
        link.href === location.href
      )
        return;
      if (!window.confirm(prompt)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    const draftLocation = location.href;
    const draftHistoryState = history.state;
    function confirmBack(event: PopStateEvent) {
      if (location.href === draftLocation) return;
      if (!window.confirm(prompt)) {
        event.stopImmediatePropagation();
        history.pushState(draftHistoryState, '', draftLocation);
      } else {
        onDiscard();
      }
    }
    window.addEventListener('beforeunload', preventLeave);
    window.addEventListener('popstate', confirmBack, true);
    document.addEventListener('click', confirmLink, true);
    return () => {
      window.removeEventListener('beforeunload', preventLeave);
      window.removeEventListener('popstate', confirmBack, true);
      document.removeEventListener('click', confirmLink, true);
    };
  }, [dirty, prompt, onDiscard]);
}
