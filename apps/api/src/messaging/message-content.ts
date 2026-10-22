import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const row = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(24),
  description: z.string().max(72).optional(),
});

export const contentSchema = z
  .object({
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
        sections: z.array(z.object({ title: z.string().max(24).optional(), rows: z.array(row).min(1).max(10) })).min(1).max(10),
      })
      .optional(),
    reply: z.object({ id: z.string(), title: z.string() }).optional(),
    location: z
      .object({ lat: z.number(), lng: z.number(), name: z.string().optional(), address: z.string().optional() })
      .optional(),
  })
  .refine((c) => Object.values(c).some((v) => v !== undefined), 'Empty message');

export type MessageContent = z.infer<typeof contentSchema>;

export function messageTypeOf(c: MessageContent): string {
  if (c.reply) return 'interactive_reply';
  if (c.media) return 'media';
  if (c.location) return 'location';
  if (c.buttons || c.list) return 'interactive';
  return 'text';
}

/** قواعد الرسائل الصادرة (حدود واتساب هي الأضيق، فنلتزم بها لكل القنوات) */
export function validateOutbound(c: MessageContent) {
  if (c.reply) throw new BadRequestException('reply is only valid for inbound messages');
  if ((c.buttons || c.list) && !c.text) throw new BadRequestException('Buttons/list require text');
  if (c.buttons && c.list) throw new BadRequestException('Use either buttons or list, not both');
  if ((c.buttons || c.list) && c.media) throw new BadRequestException('Interactive messages cannot carry media');
  if (c.media && !c.media.url) throw new BadRequestException('Outbound media requires a url');
  if (c.list) {
    const total = c.list.sections.reduce((n, s) => n + s.rows.length, 0);
    if (total > 10) throw new BadRequestException('List supports at most 10 rows in total');
  }
}
