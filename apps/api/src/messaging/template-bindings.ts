import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';

const paths = ['contact.name', 'order.id', 'order.status'] as const;
type Binding = (typeof paths)[number];
const TOKEN = /^\{\{\s*([a-z.]+)\s*\}\}$/;

export function templateBinding(value: string): Binding | undefined {
  const path = TOKEN.exec(value.trim())?.[1] as Binding | undefined;
  return path && paths.includes(path) ? path : undefined;
}

export function validateTemplateBindings(values: string[]) {
  for (const value of values) {
    if (/\{\{|\}\}/.test(value) && !templateBinding(value))
      throw new BadRequestException({
        code: 'TEMPLATE_BINDING_INVALID',
        message: 'Use a supported field by itself or enter a literal template value',
      });
  }
}

export async function conversationTemplateFields(
  c: PoolClient,
  conversationId: string,
  includeOrder: boolean,
) {
  const result = await c.query<{
    name: string;
    contact_id: string;
    channel_id: string;
    tenant_id: string;
  }>(
    `SELECT ct.name,ct.id AS contact_id,cv.channel_id,cv.tenant_id FROM conversations cv
      JOIN contacts ct ON ct.id=cv.contact_id AND ct.tenant_id=cv.tenant_id
      WHERE cv.id=$1 AND ct.archived_at IS NULL AND ct.merged_into_id IS NULL`,
    [conversationId],
  );
  const contact = result.rows[0];
  if (!contact) return {};
  const fields: Partial<Record<Binding, string>> = { 'contact.name': contact.name };
  if (includeOrder) {
    const orders = await c.query<{ id: string; status: string }>(
      `SELECT id,status FROM commerce_orders WHERE tenant_id=$1 AND contact_id=$2
       AND request->'origin'->>'conversationId'=$3 AND request->'origin'->>'channelId'=$4
       ORDER BY created_at DESC,id DESC LIMIT 2`,
      [contact.tenant_id, contact.contact_id, conversationId, contact.channel_id],
    );
    // A conversation with multiple orders has no unambiguous order to mention.
    if (orders.rows.length === 1) {
      fields['order.id'] = orders.rows[0].id;
      fields['order.status'] = orders.rows[0].status;
    }
  }
  return fields;
}

export async function resolveTemplateBody(c: PoolClient, conversationId: string, values: string[]) {
  validateTemplateBindings(values);
  const bindings = values.map(templateBinding);
  if (!bindings.some(Boolean)) return values;
  const fields = await conversationTemplateFields(
    c,
    conversationId,
    bindings.some((key) => key?.startsWith('order.')),
  );
  return values.map((value, index) => {
    const field = bindings[index];
    if (!field) return value;
    const resolved = fields[field]?.trim();
    if (!resolved)
      throw new BadRequestException({
        code: 'TEMPLATE_BINDING_MISSING',
        message: 'Required template field is missing or the order is ambiguous',
        field,
      });
    return resolved;
  });
}
