'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../../lib/api';
import { useRealtime } from '../../lib/realtime';

export type Meter = {
  used: number;
  limit: number;
  remaining: number | null;
  percent: number | null;
};
export type Usage = {
  heldInbound?: number;
  asOf: string;
  cycleStart: string;
  cycleEnd: string;
  plan: {
    plan_code: string;
    plan_name: string;
    status: string;
    limits: Record<string, number>;
    trial_expired: boolean;
    trial_ends_at: string | null;
    current_period_end: string | null;
  };
  messages: Meter;
  contacts: Meter;
  ai: Meter;
  tokens: Meter;
  reservedTokens: string;
  knownCostMicrousd: string;
  reservedCostMicrousd: string;
  costLimitMicrousd: string | null;
};
type Snapshot = { usage: Usage | null; connected: boolean; stale: boolean };
type WorkspaceEvent = { conversationId: string } & (
  | {
      type: 'message';
      message: {
        id: string;
        isInternal: boolean;
        type: string;
        senderType: string;
        senderUserId?: string;
        createdAt: string;
        direction: string;
        content: Record<string, unknown>;
      };
    }
  | { type: 'note_changed'; source: string; noteId: string; text?: string }
  | { type: 'message_status'; messageId: string; status: string; error?: string }
  | { type: 'conversation' }
  | { type: 'orders_changed' }
);
type Listener = (event: WorkspaceEvent) => void;

const SubscriptionContext = createContext<
  (Snapshot & { subscribe: (listener: Listener) => () => void }) | null
>(null);

export function SubscriptionUsageProvider({ children }: { children: ReactNode }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [connected, setConnected] = useState(false);
  const [stale, setStale] = useState(false);
  const listeners = useRef(new Set<Listener>());
  const requestRefresh = useRef<() => void>(() => {});
  const subscribe = useMemo(
    () => (listener: Listener) => {
      listeners.current.add(listener);
      return () => {
        listeners.current.delete(listener);
      };
    },
    [],
  );

  useRealtime(
    (event) => {
      if (event.type !== 'usage_changed') {
        for (const listener of listeners.current) listener(event);
      }
      requestRefresh.current();
    },
    (online) => {
      setConnected(online);
      if (online) requestRefresh.current();
    },
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = false;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      if (active) {
        pending = true;
        return;
      }
      active = true;
      try {
        const snapshot = await api<Usage>('/workspace/subscription-usage', {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
        });
        if (!controller.signal.aborted) {
          setUsage(snapshot);
          setStale(false);
        }
      } catch {
        if (!controller.signal.aborted) setStale(true);
      } finally {
        active = false;
        if (pending && !controller.signal.aborted) {
          pending = false;
          queueRefresh();
        }
      }
    }
    function queueRefresh() {
      if (timer || controller.signal.aborted) return;
      timer = setTimeout(() => {
        timer = undefined;
        void refresh();
      }, 400);
    }
    requestRefresh.current = queueRefresh;
    void refresh();
    const interval = setInterval(() => {
      if (!document.hidden) queueRefresh();
    }, 15000);
    const onVisibility = () => {
      if (!document.hidden) queueRefresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('boat:crm-changed', queueRefresh);
    window.addEventListener('boat:crm-imported', queueRefresh);
    const onOffline = () => {
      setConnected(false);
      setStale(true);
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', queueRefresh);
    return () => {
      controller.abort();
      clearInterval(interval);
      clearTimeout(timer);
      window.removeEventListener('online', queueRefresh);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('boat:crm-changed', queueRefresh);
      window.removeEventListener('boat:crm-imported', queueRefresh);
      requestRefresh.current = () => {};
    };
  }, []);

  return (
    <SubscriptionContext.Provider value={{ usage, connected, stale, subscribe }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscriptionUsage() {
  return useContext(SubscriptionContext);
}

export function useWorkspaceRealtime(onEvent: Listener) {
  const subscribe = useSubscriptionUsage()?.subscribe;
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => subscribe?.((event) => handler.current(event)), [subscribe]);
}
