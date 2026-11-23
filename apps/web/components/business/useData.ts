'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
export function useData<T>(path: string | null, initial: T) {
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [data, setData] = useState(initial);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const inFlight = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    const n = ++sequence.current;
    inFlight.current?.abort();
    if (!path) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(true);
    try {
      const result = await api<T>(path, { signal: controller.signal });
      if (n === sequence.current) {
        setData(result);
        setLoadedPath(path);
        setError('');
      }
    } catch (e) {
      if (n === sequence.current && !controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
      if (n === sequence.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void reload();
    return () => {
      sequence.current++;
      inFlight.current?.abort();
    };
  }, [reload]);
  return { data, error, loading, reload, setError, loadedPath };
}
