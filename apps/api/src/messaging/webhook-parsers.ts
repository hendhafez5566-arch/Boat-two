import { MessageContent } from './message-content';

export type InboundEvent =
  | {
      kind: 'message';
      channelType: 'whatsapp' | 'facebook' | 'instagram' | 'telegram';
      externalChannelId: string;
      contactExternalId: string;
      contactName?: string;
      externalMessageId: string;
      content: MessageContent;
    }
  | {
      kind: 'status';
      channelType: 'whatsapp';
      externalChannelId: string;
      externalMessageId: string;
      status: 'delivered' | 'read' | 'failed';
      error?: string;
    };

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const UNSUPPORTED: MessageContent = { text: '[unsupported message type]' };

/** Private Telegram chats only; provider file IDs are not exposed as public media URLs. */
export function parseTelegram(botId:string,body:Obj):InboundEvent[] {
  if(!Number.isSafeInteger(body.update_id))return[];
  const callback=body.callback_query;
  const message=callback?.message??body.message;
  const from=callback?.from??message?.from;
  if(!message||message.chat?.type!=='private'||!Number.isSafeInteger(message.chat?.id)||!from||from.is_bot)return[];
  const content:MessageContent=callback&&typeof callback.data==='string'
    ?{reply:{id:callback.data,title:''}}
    :typeof message.text==='string'?{text:message.text}
    :message.location?{location:{lat:Number(message.location.latitude),lng:Number(message.location.longitude)}}
    :{text:'[Telegram media received — file download unavailable]'};
  return[{kind:'message',channelType:'telegram',externalChannelId:botId,contactExternalId:String(message.chat.id),contactName:[from.first_name,from.last_name].filter(Boolean).join(' '),externalMessageId:`tg:${body.update_id}`,content}];
}

export function parseWhatsApp(body: Obj): InboundEvent[] {
  const out: InboundEvent[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      const phoneNumberId: string | undefined = v.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const names: Record<string, string> = {};
      for (const c of v.contacts ?? []) names[c.wa_id] = c.profile?.name;

      for (const m of v.messages ?? []) {
        out.push({
          kind: 'message',
          channelType: 'whatsapp',
          externalChannelId: phoneNumberId,
          contactExternalId: m.from,
          contactName: names[m.from],
          externalMessageId: m.id,
          content: whatsappContent(m),
        });
      }
      for (const s of v.statuses ?? []) {
        if (!['delivered', 'read', 'failed'].includes(s.status)) continue;
        out.push({
          kind: 'status',
          channelType: 'whatsapp',
          externalChannelId: phoneNumberId,
          externalMessageId: s.id,
          status: s.status,
          error: s.errors?.[0]?.title ?? s.errors?.[0]?.message,
        });
      }
    }
  }
  return out;
}

function whatsappContent(m: Obj): MessageContent {
  switch (m.type) {
    case 'text':
      return { text: m.text?.body ?? '' };
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'sticker': {
      const d = m[m.type] ?? {};
      const kind = m.type === 'document' ? 'file' : m.type === 'sticker' ? 'image' : m.type;
      return {
        media: { kind, providerMediaId: d.id, caption: d.caption, mimeType: d.mime_type, filename: d.filename },
      };
    }
    case 'interactive': {
      const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
      return r ? { text: r.title, reply: { id: r.id, title: r.title } } : UNSUPPORTED;
    }
    case 'button':
      return { text: m.button?.text, reply: { id: m.button?.payload ?? m.button?.text, title: m.button?.text } };
    case 'location':
      return { location: { lat: m.location.latitude, lng: m.location.longitude, name: m.location.name, address: m.location.address } };
    default:
      return UNSUPPORTED;
  }
}

/** فيسبوك (object=page) وإنستجرام (object=instagram) */
export function parseMeta(body: Obj): InboundEvent[] {
  const channelType = body.object === 'instagram' ? 'instagram' : body.object === 'page' ? 'facebook' : null;
  if (!channelType) return [];
  const out: InboundEvent[] = [];

  for (const entry of body.entry ?? []) {
    for (const ev of entry.messaging ?? []) {
      const senderId: string | undefined = ev.sender?.id;
      if (!senderId || senderId === entry.id || ev.message?.is_echo) continue;

      if (ev.message) {
        const m = ev.message;
        let content: MessageContent;
        const att = m.attachments?.[0];
        if (m.quick_reply) {
          content = { text: m.text, reply: { id: m.quick_reply.payload, title: m.text ?? '' } };
        } else if (att && ['image', 'video', 'audio', 'file'].includes(att.type)) {
          content = { media: { kind: att.type, url: att.payload?.url, caption: m.text } };
        } else if (att?.type === 'location' && att.payload?.coordinates) {
          content = { location: { lat: att.payload.coordinates.lat, lng: att.payload.coordinates.long } };
        } else if (m.text) {
          content = { text: m.text };
        } else {
          content = UNSUPPORTED;
        }
        out.push({
          kind: 'message',
          channelType,
          externalChannelId: entry.id,
          contactExternalId: senderId,
          externalMessageId: m.mid,
          content,
        });
      } else if (ev.postback) {
        out.push({
          kind: 'message',
          channelType,
          externalChannelId: entry.id,
          contactExternalId: senderId,
          externalMessageId: ev.postback.mid ?? `${senderId}-${ev.timestamp}`,
          content: { text: ev.postback.title, reply: { id: ev.postback.payload, title: ev.postback.title ?? '' } },
        });
      }
    }
  }
  return out;
}
