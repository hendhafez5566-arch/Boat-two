import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const row = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(24),
  description: z.string().max(72).optional(),
});

export const contentSchema = z
  .object({
    typingSeconds:z.number().int().min(0).max(5).optional(),
    telegramSender:z.object({id:z.string().max(30),name:z.string().max(200)}).optional(),
    flowReply:z.record(z.unknown()).optional(),
    order:z.object({catalogId:z.string(),items:z.array(z.object({retailerId:z.string(),quantity:z.number().int().positive(),price:z.string(),currency:z.string()})).max(30)}).optional(),
    product:z.object({catalogId:z.string().min(1).max(200),retailerId:z.string().min(1).max(200)}).optional(),
    productList:z.object({catalogId:z.string().min(1).max(200),sections:z.array(z.object({title:z.string().min(1).max(24),retailerIds:z.array(z.string().min(1).max(200)).min(1).max(30)})).min(1).max(10)}).optional(),
    whatsappFlow:z.object({flowId:z.string().regex(/^\d+$/),token:z.string().min(1).max(200),cta:z.string().min(1).max(20),screen:z.string().min(1).max(80),data:z.record(z.unknown()).optional()}).optional(),
    header: z.discriminatedUnion('type',[z.object({type:z.literal('text'),text:z.string().min(1).max(60)}),z.object({type:z.literal('image'),url:z.string().url().max(2000)})]).optional(),
    footer: z.string().max(60).optional(),
    template: z
      .object({
        name: z.string().regex(/^[a-z0-9_]{1,512}$/),
        language: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/),
        bodyParams: z.array(z.string().min(1).max(1024)).max(20).default([]),
        header: z
          .discriminatedUnion('type', [
            z.object({ type: z.literal('text'), text: z.string().min(1).max(60) }).strict(),
            z
              .object({
                type: z.enum(['image', 'video', 'document']),
                url: z.string().url().max(2048),
                filename: z.string().min(1).max(200).optional(),
              })
              .strict(),
          ])
          .optional(),
        buttonParams: z
          .array(
            z
              .object({
                index: z.number().int().min(0).max(9),
                type: z.enum(['quick_reply', 'url']),
                value: z.string().min(1).max(1024),
              })
              .strict(),
          )
          .max(10)
          .optional(),
      })
      .strict()
      .optional(),
    text: z.string().max(4096).optional(),
    media: z
      .object({
        kind: z.enum(['image', 'video', 'audio', 'file']),
        url: z.string().url().optional(),
        providerMediaId: z.string().optional(),
        caption: z.string().max(1024).optional(),
        filename: z.string().max(200).optional(),
        mimeType: z.string().max(100).optional(),
      })
      .optional(),
    buttons: z
      .array(z.object({ id: z.string().min(1).max(200), title: z.string().min(1).max(20) }))
      .max(3)
      .optional(),
    list: z
      .object({
        buttonText: z.string().min(1).max(20),
        sections: z
          .array(
            z.object({ title: z.string().max(24).optional(), rows: z.array(row).min(1).max(10) }),
          )
          .min(1)
          .max(10),
      })
      .optional(),
    cta: z
      .object({
        text: z.string().min(1).max(20),
        url: z.string().url().max(2000),
      })
      .optional(),
    reply: z.object({ id: z.string(), title: z.string() }).optional(),
    location: z
      .object({
        lat: z.number(),
        lng: z.number(),
        name: z.string().optional(),
        address: z.string().optional(),
      })
      .optional(),
  })
  .refine((c) => Object.values(c).some((v) => v !== undefined), 'Empty message');

export type MessageContent = z.infer<typeof contentSchema>;

export function messageTypeOf(c: MessageContent): string {
  if(c.product||c.productList||c.whatsappFlow)return 'interactive';
  if (c.reply) return 'interactive_reply';
  if (c.media) return 'media';
  if (c.location) return 'location';
  if (c.buttons || c.list || c.cta) return 'interactive';
  return 'text';
}

/** قواعد الرسائل الصادرة (حدود واتساب هي الأضيق، فنلتزم بها لكل القنوات) */
export function validateOutbound(c: MessageContent) {
  if(c.telegramSender||c.flowReply||c.order)throw new BadRequestException('Form replies and orders are inbound-only');
  if(c.product||c.productList||c.whatsappFlow){if(!c.text||c.text.length>1024)throw new BadRequestException('Native interactive body requires 1–1024 characters');if([c.product,c.productList,c.whatsappFlow].filter(Boolean).length>1||c.buttons||c.list||c.cta||c.template||c.media)throw new BadRequestException('Native product/flow cannot be combined with another action');}
  if ((c.header?.type === 'text' && (!c.header.text || c.header.text.length > 60)) || (c.footer?.length ?? 0) > 60) throw new BadRequestException('Interactive header/footer supports at most 60 characters');
  if ((c.header || c.footer) && !(c.buttons || c.list || c.cta)) throw new BadRequestException('Header/footer require an interactive message');
  if (c.header && c.media) throw new BadRequestException('Choose either an explicit header or media header');
  if ((c.buttons || c.list || c.cta) && (c.text?.length ?? 0) > 1024) throw new BadRequestException('Interactive body supports at most 1024 characters');
  if (c.template && (c.text || c.media || c.buttons || c.list || c.cta || c.location || c.reply))
    throw new BadRequestException('Template must be sent without other content');
  if (c.reply) throw new BadRequestException('reply is only valid for inbound messages');
  if ((c.buttons || c.list) && !c.text) throw new BadRequestException('Buttons/list require text');
  if (c.buttons && c.list) throw new BadRequestException('Use either buttons or list, not both');
  if ((c.buttons || c.list || c.cta) && c.media && c.media.kind !== 'image')
    throw new BadRequestException('Interactive messages can only carry an image header');
  if (c.cta && !c.text) throw new BadRequestException('CTA button requires text');
  if (c.cta && (c.buttons || c.list)) throw new BadRequestException('CTA cannot be combined with buttons or list');
  if (c.media && !c.media.url) throw new BadRequestException('Outbound media requires a url');
  if (c.list) {
    const total = c.list.sections.reduce((n, s) => n + s.rows.length, 0);
    if (total > 10) throw new BadRequestException('List supports at most 10 rows in total');
  }
}
