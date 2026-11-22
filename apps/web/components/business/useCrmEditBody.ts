import { useRef } from 'react';

export function useCrmEditBody() {
  const pending = useRef<{ key: string; requestId: string }>();
  return (path: string, changes: object) => {
    const key = path + '\n' + JSON.stringify(changes);
    if (pending.current?.key !== key)
      pending.current = { key, requestId: crypto.randomUUID() };
    return { ...changes, requestId: pending.current.requestId };
  };
}
