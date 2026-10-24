import { Injectable } from '@nestjs/common';
import { MessageContent } from '../message-content';
import { ChannelAdapter, GRAPH, graphPost } from './adapter';

@Injectable()
export class WhatsAppAdapter implements ChannelAdapter {
  async send(creds: Record<string, string>, to: string, c: MessageContent) {
    const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
    let payload: Record<string, unknown>;

    if (c.template) {
      payload = {
        ...base,
        type: 'template',
        template: {
          name: c.template.name,
          language: { code: c.template.language },
          components: [
            ...(c.template.header
              ? [
                  {
                    type: 'header',
                    parameters: [
                      c.template.header.type === 'text'
                        ? { type: 'text', text: c.template.header.text }
                        : {
                            type: c.template.header.type,
                            [c.template.header.type]: {
                              link: c.template.header.url,
                              ...(c.template.header.type === 'document' &&
                              c.template.header.filename
                                ? { filename: c.template.header.filename }
                                : {}),
                            },
                          },
                    ],
                  },
                ]
              : []),
            ...(c.template.bodyParams.length
              ? [
                  {
                    type: 'body',
                    parameters: c.template.bodyParams.map((text) => ({ type: 'text', text })),
                  },
                ]
              : []),
            ...(c.template.buttonParams ?? []).map((b) => ({
              type: 'button',
              sub_type: b.type,
              index: String(b.index),
              parameters: [
                b.type === 'quick_reply'
                  ? { type: 'payload', payload: b.value }
                  : { type: 'text', text: b.value },
              ],
            })),
          ],
        },
      };
    } else if (c.cta) {
      payload = {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          ...(c.media?.kind === 'image' && c.media.url
            ? { header: { type: 'image', image: { link: c.media.url } } }
            : {}),
          body: { text: c.text },
          action: { name: 'cta_url', parameters: { display_text: c.cta.text, url: c.cta.url } },
        },
      };
    } else if (c.list) {
      payload = {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: c.text },
          action: {
            button: c.list.buttonText,
            sections: c.list.sections.map((s) => ({
              title: s.title,
              rows: s.rows.map((r) => ({ id: r.id, title: r.title, description: r.description })),
            })),
          },
        },
      };
    } else if (c.buttons?.length) {
      payload = {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'button',
          ...(c.media?.kind === 'image' && c.media.url
            ? { header: { type: 'image', image: { link: c.media.url } } }
            : {}),
          body: { text: c.text },
          action: {
            buttons: c.buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
          },
        },
      };
    } else if (c.media && !c.buttons?.length) {
      const m = c.media;
      const type = m.kind === 'file' ? 'document' : m.kind;
      payload = {
        ...base,
        type,
        [type]: {
          link: m.url,
          ...(m.kind !== 'audio' && (m.caption ?? c.text) ? { caption: m.caption ?? c.text } : {}),
          ...(m.kind === 'file' && m.filename ? { filename: m.filename } : {}),
        },
      };
    } else if (c.location) {
      payload = {
        ...base,
        type: 'location',
        location: {
          latitude: c.location.lat,
          longitude: c.location.lng,
          name: c.location.name,
          address: c.location.address,
        },
      };
    } else {
      payload = { ...base, type: 'text', text: { body: c.text, preview_url: true } };
    }

    const data = (await graphPost(
      `${GRAPH}/${creds.phoneNumberId}/messages`,
      creds.accessToken,
      payload,
    )) as {
      messages?: { id: string }[];
    };
    return { externalId: data.messages?.[0]?.id ?? null };
  }
}
