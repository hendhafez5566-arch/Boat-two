'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react';
import { API, api } from './api';

/** اتصال SSE بالسيرفر مع إعادة الاتصال التلقائي (تذكرة جديدة في كل مرة) */
export function useRealtime(onEvent: (e: any) => void) {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    let es: EventSource | null = null;
    let stopped = false;
    let delay = 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const retry = () => {
      if (stopped) return;
      delay = Math.min(delay * 2, 30000);
      timer = setTimeout(connect, delay);
    };

    async function connect() {
      try {
        const { ticket } = await api<{ ticket: string }>('/realtime/ticket', { method: 'POST' });
        es = new EventSource(`${API}/realtime/stream?ticket=${encodeURIComponent(ticket)}`);
        for (const type of ['message', 'message_status', 'conversation']) {
          es.addEventListener(type, (ev) => {
            try { handler.current(JSON.parse((ev as MessageEvent).data)); } catch { /* تجاهل حدث تالف */ }
          });
        }
        es.onopen = () => { delay = 1000; };
        es.onerror = () => { es?.close(); retry(); };
      } catch {
        retry();
      }
    }
    connect();
    return () => { stopped = true; if (timer) clearTimeout(timer); es?.close(); };
  }, []);
}
