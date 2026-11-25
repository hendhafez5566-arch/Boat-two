'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react';
import { API, api } from './api';

/** اتصال SSE بالسيرفر مع إعادة الاتصال التلقائي (تذكرة جديدة في كل مرة) */
export function useRealtime(onEvent: (e: any) => void, onConnection?: (connected: boolean) => void) {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const connection = useRef(onConnection);
  connection.current = onConnection;

  useEffect(() => {
    let es: EventSource | null = null;
    let cursor = '';
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
        if (stopped) return;
        es = new EventSource(
          `${API}/realtime/stream?ticket=${encodeURIComponent(ticket)}${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`,
        );
        for (const type of ['message', 'message_status', 'note_changed', 'conversation']) {
          es.addEventListener(type, (ev) => {
            try {
              cursor = (ev as MessageEvent).lastEventId || cursor;
              handler.current(JSON.parse((ev as MessageEvent).data));
            } catch {
              /* تجاهل حدث تالف */
            }
          });
        }
        es.onopen = () => {
          delay = 1000;
          connection.current?.(true);
        };
        es.onerror = () => {
          es?.close();
          connection.current?.(false);
          retry();
        };
      } catch {
        connection.current?.(false);
        retry();
      }
    }
    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, []);
}
