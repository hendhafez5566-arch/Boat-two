import { BadRequestException } from '@nestjs/common';
import { MessageContent } from './message-content';
import { isIP } from 'node:net';
import { isBlockedIp } from '../flows/http-safe';

type Button = { type: string; text: string; url?: string; phone_number?: string };
export type TemplateComponent = {
  type: string;
  format?: string;
  text?: string;
  buttons?: Button[];
};
export function variableCount(text = '') {
  const indices = [...new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort(
    (a, b) => a - b,
  );
  if (indices.some((n, i) => n !== i + 1) || /\{\{|\}\}/.test(text.replace(/\{\{\d+\}\}/g, '')))
    return -1;
  return indices.length;
}
export function publicTemplateMedia(url: string) {
  const u = new URL(url),
    host = u.hostname.replaceAll('[', '').replaceAll(']', '');
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    host === 'localhost' ||
    host.endsWith('.local') ||
    (isIP(host) && isBlockedIp(host))
  )
    throw new BadRequestException('Template media requires a public HTTPS URL without credentials');
}
export function supportedTemplate(category: string, components: TemplateComponent[]) {
  if (
    !['MARKETING', 'UTILITY'].includes(category) ||
    !Array.isArray(components) ||
    !components.length
  )
    return false;
  const types = components.map((c) => c.type);
  if (new Set(types).size !== types.length || types.filter((t) => t === 'BODY').length !== 1)
    return false;
  return components.every((c) => {
    if (c.type === 'BODY')
      return !!c.text && variableCount(c.text) >= 0 && variableCount(c.text) <= 20;
    if (c.type === 'FOOTER') return typeof c.text === 'string' && variableCount(c.text) === 0;
    if (c.type === 'HEADER')
      return c.format === 'TEXT'
        ? !!c.text && variableCount(c.text) >= 0 && variableCount(c.text) <= 1
        : ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(c.format ?? '');
    if (c.type === 'BUTTONS')
      return (
        !!c.buttons?.length &&
        c.buttons.length <= 10 &&
        c.buttons.every((b) => {
          if (!b.text || b.text.length > 25) return false;
          if (b.type === 'QUICK_REPLY') return true;
          if (b.type === 'PHONE_NUMBER') return /^\+?[0-9]{6,20}$/.test(b.phone_number ?? '');
          if (b.type === 'URL') {
            if (
              !b.url ||
              variableCount(b.url) < 0 ||
              variableCount(b.url) > 1 ||
              (variableCount(b.url) === 1 && !b.url.endsWith('{{1}}'))
            )
              return false;
            try {
              const u = new URL(b.url.replace('{{1}}', 'value'));
              return (
                u.protocol === 'https:' &&
                !u.username &&
                !u.password &&
                !new URL(b.url).hostname.includes('{{')
              );
            } catch {
              return false;
            }
          }
          return false;
        })
      );
    return false;
  });
}
export function validateTemplateParameters(
  row: { body: string; category?: string; components?: TemplateComponent[] },
  value: NonNullable<MessageContent['template']>,
) {
  // Empty definitions are legacy BODY-only records, never an inferred rich definition.
  const components = row.components?.length ? row.components : [{ type: 'BODY', text: row.body }];
  if (!supportedTemplate(row.category ?? 'UTILITY', components))
    throw new BadRequestException(
      'Unsupported template definition; synchronize a supported provider variant',
    );
  if (
    variableCount(row.body) !== value.bodyParams.length ||
    value.bodyParams.some((v) => !v.trim())
  )
    throw new BadRequestException('Template BODY parameter count or order is invalid');
  const header = components.find((c) => c.type === 'HEADER');
  if (header?.format === 'TEXT' && variableCount(header.text) === 1) {
    if (
      value.header?.type !== 'text' ||
      !value.header.text?.trim() ||
      value.header.text.length > 60
    )
      throw new BadRequestException('Template requires one text header value');
  } else if (header && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(header.format ?? '')) {
    const kind = header.format!.toLowerCase();
    if (
      !value.header ||
      value.header.type === 'text' ||
      value.header.type !== kind ||
      !value.header.url
    )
      throw new BadRequestException(
        'Template header media type does not match its approved definition',
      );
    publicTemplateMedia(value.header.url);
    if (value.header.filename && kind !== 'document')
      throw new BadRequestException('Only document headers support filenames');
  } else if (value.header)
    throw new BadRequestException('This template does not accept header parameters');
  const expected = (components.find((c) => c.type === 'BUTTONS')?.buttons ?? []).flatMap(
    (b, index) =>
      b.type === 'QUICK_REPLY'
        ? [{ index, type: 'quick_reply' }]
        : b.type === 'URL' && variableCount(b.url) === 1
          ? [{ index, type: 'url' }]
          : [],
  );
  const inputs = value.buttonParams ?? [];
  if (
    inputs.length !== expected.length ||
    new Set(inputs.map((b) => b.index)).size !== inputs.length ||
    expected.some(
      (e) => !inputs.some((b) => b.index === e.index && b.type === e.type && b.value.trim()),
    )
  )
    throw new BadRequestException(
      'Template button parameters must match the approved button indices and types',
    );
  if (inputs.some((b) => b.type === 'url' && /[\r\n]/.test(b.value)))
    throw new BadRequestException('Invalid dynamic URL suffix');
}
