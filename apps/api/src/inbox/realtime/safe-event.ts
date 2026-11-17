import type { MessageEvent } from '@nestjs/common';
/** Keep application data out of SSE field delimiters, including on Nest 10. */
export function safeRealtimeEvent(id: string, payload: Record<string, unknown>): MessageEvent {
  if (!/^\d+$/.test(id)) throw new Error('Invalid persisted stream cursor');
  const type = typeof payload.type === 'string' && /^[a-z][a-z0-9_.:-]{0,79}$/i.test(payload.type)
    ? payload.type : 'message';
  return { id, type, data: payload };
}
