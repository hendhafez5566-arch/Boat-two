import { MessageContent } from '../message-content';

export const GRAPH = 'https://graph.facebook.com/v21.0';

export interface ChannelAdapter {
  typing?(credentials:Record<string,string>,recipientId:string):Promise<void>;
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

/** Run only inside the outbound worker, after policy checks and durable claim. */
export async function sendWithTyping(adapter:ChannelAdapter,credentials:Record<string,string>,recipientId:string,content:MessageContent,wait:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms))) {
  const seconds=Math.min(5,Math.max(0,Number(content.typingSeconds)||0));
  if(seconds&&adapter.typing){
    // A cosmetic provider failure must not prevent delivery or replay the message.
    try{await adapter.typing(credentials,recipientId);await wait(seconds*1000);}catch{}
  }
  const {typingSeconds:_typing,...message}=content;
  return adapter.send(credentials,recipientId,message);
}
