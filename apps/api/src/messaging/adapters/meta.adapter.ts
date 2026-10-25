import { Injectable } from '@nestjs/common';
import { MessageContent } from '../message-content';
import { ChannelAdapter, GRAPH, graphPost, ProviderError } from './adapter';

/** فيسبوك ماسنجر وإنستجرام يستخدمان نفس واجهة الإرسال */
@Injectable()
export class MetaAdapter implements ChannelAdapter {
  async typing(creds:Record<string,string>,recipientId:string){await graphPost(`${GRAPH}/me/messages`,creds.pageAccessToken,{recipient:{id:recipientId},sender_action:'typing_on'});}
  async send(creds: Record<string, string>, recipientId: string, c: MessageContent) {
    if(c.product||c.productList||c.whatsappFlow)throw new ProviderError('Native commerce/flows require WhatsApp; use a fallback product card',400);
    // Messenger/Instagram have no WhatsApp header/footer fields: preserve their content as text/media.
    c = { ...c, text:[c.header?.type === 'text' ? c.header.text : '',c.text,c.footer].filter(Boolean).join('\n'),
      ...(c.header?.type === 'image' && !c.media ? {media:{kind:'image' as const,url:c.header.url}} : {}) };
    const url = `${GRAPH}/me/messages`;
    const token = creds.pageAccessToken;
    const recipient = { id: recipientId };
    const post = (message: unknown) =>
      graphPost(url, token, { recipient, messaging_type: 'RESPONSE', message }) as Promise<{ message_id?: string }>;

    // الأزرار والقوائم تُرسل كـ quick replies (حد أقصى 13)
    const quick = c.buttons
      ? c.buttons.map((b) => ({ content_type: 'text', title: b.title, payload: b.id }))
      : c.list
        ? c.list.sections.flatMap((s) => s.rows).slice(0, 13).map((r) => ({ content_type: 'text', title: r.title, payload: r.id }))
        : undefined;

    if (c.cta) {
      const r = await post({ text: `${c.text}\n${c.cta.text}: ${c.cta.url}` });
      return { externalId: r.message_id ?? null };
    }
    if (c.media && !quick) {
      const type = c.media.kind === 'file' ? 'file' : c.media.kind;
      const first = await post({ attachment: { type, payload: { url: c.media.url, is_reusable: false } } });
      const caption = c.media.caption ?? c.text;
      if (caption) await post({ text: caption });
      return { externalId: first.message_id ?? null };
    }
    if (c.location) {
      const text = `${c.location.name ?? ''} https://maps.google.com/?q=${c.location.lat},${c.location.lng}`.trim();
      const r = await post({ text });
      return { externalId: r.message_id ?? null };
    }
    if (c.media && quick) await post({ attachment: { type: 'image', payload: { url: c.media.url, is_reusable: false } } });
    const r = await post({ text: c.text, ...(quick ? { quick_replies: quick } : {}) });
    return { externalId: r.message_id ?? null };
  }
}
