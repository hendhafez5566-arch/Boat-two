import { MessageContent } from '../message-content';

export const GRAPH = 'https://graph.facebook.com/v21.0';

export interface ChannelAdapter {
  /** يرسل الرسالة ويرجع معرّفها عند المزوّد */
  send(
    credentials: Record<string, string>,
    recipientId: string,
    content: MessageContent,
  ): Promise<{ externalId: string | null }>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function graphPost(url: string, token: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & Record<
    string,
    unknown
  >;
  if (!res.ok)
    throw new ProviderError(data.error?.message ?? `Graph API error ${res.status}`, res.status);
  return data;
}
