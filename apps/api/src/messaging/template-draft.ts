import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';
import { supportedTemplate, variableCount, TemplateComponent } from './template-contract';
import { parse } from '../common/zod';

const sample = z.string().trim().min(1).max(500);
const button = z.discriminatedUnion('type', [
  z.object({ type: z.literal('QUICK_REPLY'), text: z.string().trim().min(1).max(25) }).strict(),
  z
    .object({
      type: z.literal('PHONE_NUMBER'),
      text: z.string().trim().min(1).max(25),
      phone_number: z.string().regex(/^\+[0-9]{6,15}$/),
    })
    .strict(),
  z
    .object({
      type: z.literal('URL'),
      text: z.string().trim().min(1).max(25),
      url: z.string().max(2000),
      example: z.array(z.string().url().max(2000)).max(1).optional(),
    })
    .strict(),
]);
const header = z.discriminatedUnion('format', [
  z
    .object({
      type: z.literal('HEADER'),
      format: z.literal('TEXT'),
      text: z.string().trim().min(1).max(60),
      example: z
        .object({ header_text: z.array(sample).max(1) })
        .strict()
        .optional(),
    })
    .strict(),
  ...(['IMAGE', 'VIDEO', 'DOCUMENT'] as const).map((format) =>
    z
      .object({
        type: z.literal('HEADER'),
        format: z.literal(format),
        example: z
          .object({ header_handle: z.array(z.string().trim().min(1).max(4096)).length(1) })
          .strict(),
      })
      .strict(),
  ),
]);
const schema = z
  .object({
    name: z.string().regex(/^[a-z0-9_]{1,512}$/),
    language: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/),
    category: z.enum(['MARKETING', 'UTILITY']),
    body: z.string().trim().min(1).max(1024),
    examples: z.array(sample).max(20).default([]),
    header: header.optional(),
    footer: z.string().trim().min(1).max(60).optional(),
    buttons: z.array(button).max(10).default([]),
  })
  .strict();
export function parseTemplateDraft(input: unknown) {
  const b = parse(schema, input);
  if (variableCount(b.body) !== b.examples.length)
    throw new BadRequestException('Provide one example per BODY variable in contiguous order');
  if (
    b.header?.format === 'TEXT' &&
    variableCount(b.header.text) !== (b.header.example?.header_text.length ?? 0)
  )
    throw new BadRequestException('Provide one example per HEADER variable');
  // Supported Meta authoring limits: at most two URLs and one phone, no mixed quick replies/CTAs.
  const replies = b.buttons.filter((x) => x.type === 'QUICK_REPLY').length;
  if (
    (replies && replies !== b.buttons.length) ||
    b.buttons.filter((x) => x.type === 'URL').length > 2 ||
    b.buttons.filter((x) => x.type === 'PHONE_NUMBER').length > 1
  )
    throw new BadRequestException(
      'Use quick replies or at most two URL buttons and one phone button',
    );
  for (const bt of b.buttons)
    if (bt.type === 'URL') {
      const count = variableCount(bt.url);
      if (count !== (bt.example?.length ?? 0))
        throw new BadRequestException('Dynamic URL buttons require a complete sample URL');
      if (count === 1) {
        const prefix = bt.url.slice(0, -5);
        if (
          !bt.example![0].startsWith(prefix) ||
          bt.example![0].length <= prefix.length ||
          /[{}\r\n]/.test(bt.example![0])
        )
          throw new BadRequestException('URL example must extend the static URL prefix');
      }
    }
  const components = [
    ...(b.header ? [b.header] : []),
    {
      type: 'BODY',
      text: b.body,
      ...(b.examples.length ? { example: { body_text: [b.examples] } } : {}),
    },
    ...(b.footer ? [{ type: 'FOOTER', text: b.footer }] : []),
    ...(b.buttons.length ? [{ type: 'BUTTONS', buttons: b.buttons }] : []),
  ];
  if (!supportedTemplate(b.category, components as TemplateComponent[]))
    throw new BadRequestException('Unsupported template definition');
  return { ...b, components };
}
