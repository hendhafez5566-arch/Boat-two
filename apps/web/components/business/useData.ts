'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
export function useData<T>(path: string, initial: T) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    const n = ++sequence.current;
    setLoading(true);
    try {
      const result = await api<T>(path);
      if (n === sequence.current) {
        setData(result);
        setError('');
      }
    } catch (e) {
      if (n === sequence.current) setError((e as Error).message);
    } finally {
      if (n === sequence.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void reload();
    return () => {
      sequence.current++;
    };
  }, [reload]);
  return { data, error, loading, reload, setError };
}
