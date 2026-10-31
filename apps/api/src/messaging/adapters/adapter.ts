import { MessageContent } from '../message-content';

export const GRAPH = 'https://graph.facebook.com/v21.0';

export interface ChannelAdapter {
  typing?(credentials:Record<string,string>,recipientId:string,context?:{lastInboundMessageId?:string}):Promise<void|boolean>;
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
    readonly providerCode?: number,
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
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & Record<
    string,
    unknown
  >;
  if (!res.ok) {
    const code = Number.isInteger(data.error?.code) ? data.error!.code : undefined;
    const kind = code === 190 ? 'authentication' : code === 10 || code === 200 || code === 131005 ? 'permission' : 'request';
    // Provider descriptions can echo submitted fields. Keep safe codes only.
    throw new ProviderError(`Meta ${kind} error${code ? ` (#${code})` : ''}; HTTP ${res.status}`, res.status, code);
  }
  return data;
}

/** Run only inside the outbound worker, after policy checks and durable claim. */
export async function sendWithTyping(adapter:ChannelAdapter,credentials:Record<string,string>,recipientId:string,content:MessageContent,wait:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms)),context?:{lastInboundMessageId?:string}) {
  const seconds=Math.min(5,Math.max(0,Number(content.typingSeconds)||0));
  if(seconds&&adapter.typing){
    // A cosmetic provider failure must not prevent delivery or replay the message.
    try{if(await adapter.typing(credentials,recipientId,context)!==false)await wait(seconds*1000);}catch{}
  }
  const {typingSeconds:_typing,...message}=content;
  return adapter.send(credentials,recipientId,message);
}
