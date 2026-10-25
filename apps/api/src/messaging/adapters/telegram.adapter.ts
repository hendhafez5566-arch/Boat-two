import {Injectable} from '@nestjs/common';
import {ChannelAdapter,ProviderError} from './adapter';
import {MessageContent} from '../message-content';
import {timingSafeEqual} from 'node:crypto';

export function telegramWebhookAuthorized(expected:string|undefined,provided:string|undefined) {
  const a=Buffer.from(expected??''),b=Buffer.from(provided??'');
  return !!a.length&&a.length===b.length&&timingSafeEqual(a,b);
}

export async function telegramCall(token:string,method:string,body:Record<string,unknown>={},timeoutMs=15000) {
  let response:Response;
  try { response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)}); }
  catch { throw new ProviderError('Telegram provider unreachable',503); }
  const data=await response.json() as {ok:boolean;result?:Record<string,unknown>;error_code?:number};
  if(!response.ok||!data.ok)throw new ProviderError('Telegram rejected the request',data.error_code??response.status);
  return data.result??{};
}

@Injectable()
export class TelegramAdapter implements ChannelAdapter {
  async typing(credentials:Record<string,string>,chatId:string){await telegramCall(credentials.botToken,'sendChatAction',{chat_id:chatId,action:'typing'},3000);}
  async send(credentials:Record<string,string>,chatId:string,c:MessageContent) {
    if(c.product||c.productList||c.whatsappFlow)throw new ProviderError('Native commerce/flows require WhatsApp; use a fallback product card',400);
    if(c.template)throw new ProviderError('WhatsApp templates are unavailable on Telegram',400);
    const choices=c.buttons??c.list?.sections.flatMap(s=>s.rows)??[];
    if(choices.some(b=>Buffer.byteLength(b.id)>64))throw new ProviderError('Telegram callback IDs must fit 64 bytes; IDs were not truncated',400);
    const text=[c.header?.type==='text'?c.header.text:'',c.text,c.footer].filter(Boolean).join('\n');
    const reply_markup=c.cta?{inline_keyboard:[[{text:c.cta.text,url:c.cta.url}]]}:choices.length?{inline_keyboard:choices.map(b=>[{text:b.title,callback_data:b.id}])}:undefined;
    const media=c.media??(c.header?.type==='image'?{kind:'image' as const,url:c.header.url}:undefined);
    let method='sendMessage';let body:Record<string,unknown>={chat_id:chatId,text,...(reply_markup?{reply_markup}:{})};
    if(media){const key={image:'photo',video:'video',audio:'audio',file:'document'}[media.kind];method='send'+key[0].toUpperCase()+key.slice(1);body={chat_id:chatId,[key]:media.url,...(text||media.caption?{caption:media.caption??text}:{}),...(reply_markup?{reply_markup}:{})};if(String(body.caption??'').length>1024)throw new ProviderError('Telegram media caption exceeds 1024 characters',400);}
    else if(c.location){method='sendLocation';body={chat_id:chatId,latitude:c.location.lat,longitude:c.location.lng};}
    if(text.length>4096)throw new ProviderError('Telegram text exceeds 4096 characters',400);
    const result=await telegramCall(credentials.botToken,method,body);
    return{externalId:result.message_id==null?null:String(result.message_id)};
  }
}
