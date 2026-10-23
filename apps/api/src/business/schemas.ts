import { z } from 'zod';
export const filtersSchema = z.object({
  q: z.string().max(100).optional(),
  lifecycle: z.enum(['lead', 'qualified', 'customer', 'inactive']).optional(),
  tag: z.string().max(50).optional(),
  ownerId: z.string().uuid().optional(),
  archived: z.enum(['active', 'archived', 'all']).default('active'),
});
export const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  lifecycle: z.enum(['lead', 'qualified', 'customer', 'inactive']).default('lead'),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
  attributes: z
    .record(z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]))
    .default({}),
  ownerId: z.string().uuid().nullable().optional(),
  allowDuplicate: z.boolean().default(false),
});
export const pagination = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const conditionsSchema = filtersSchema.extend({
  allOf: z.array(filtersSchema).max(10).default([]),
  anyOf: z.array(filtersSchema).max(10).default([]),
});
export function conditionWhere(input: z.infer<typeof conditionsSchema>) {
  const base = contactWhere(input),
    params: unknown[] = [...base.params];
  const clause = (filter: Filters) => {
    const next = contactWhere(filter);
    const offset = params.length;
    params.push(...next.params);
    return '(' + next.sql.replace(/\$(\d+)/g, (_, n) => '$' + (Number(n) + offset)) + ')';
  };
  const all = input.allOf.map(clause),
    any = input.anyOf.map(clause);
  return {
    sql:
      '(' +
      base.sql +
      ')' +
      (all.length ? ' AND ' + all.join(' AND ') : '') +
      (any.length ? ' AND (' + any.join(' OR ') + ')' : ''),
    params,
  };
}
export const baseActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tag'), tag: z.string().min(1).max(50) }),
  z.object({
    type: z.literal('lifecycle'),
    value: z.enum(['lead', 'qualified', 'customer', 'inactive']),
  }),
  z.object({
    type: z.literal('task'),
    title: z.string().min(1).max(200),
    delayMinutes: z.number().int().min(0).max(525600),
  }),
  z.object({ type: z.literal('note'), text: z.string().min(1).max(4000) }),
]);
export const actionSchema = z.union([
  baseActionSchema,
  z.object({
    type: z.literal('branch'),
    conditions: conditionsSchema,
    then: z.array(baseActionSchema).min(1).max(10),
    otherwise: z.array(baseActionSchema).max(10).default([]),
  }),
  z.object({
    type: z.literal('http'),
    url: z
      .string()
      .url()
      .max(2000)
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
        );
      }, 'Use HTTPS without credentials or query secrets'),
    body: z.string().max(16000).default(''),
  }),
  z.object({
    type: z.literal('delay'),
    delayMinutes: z.number().int().min(1).max(525600),
    actions: z.array(baseActionSchema).min(1).max(10),
  }),
]);
export const ruleSchema = z.object({
  name: z.string().min(1).max(120),
  enabled: z.boolean().default(false),
  trigger: z.enum([
    'crm.contacts.insert',
    'crm.contacts.update',
    'crm.crm_deals.insert',
    'crm.crm_deals.update',
    'crm.crm_tasks.insert',
    'crm.crm_tasks.update',
    'automation.scheduled',
  ]),
  conditions: conditionsSchema.default({}),
  actions: z.array(actionSchema).min(1).max(10),
});
export type Filters = z.infer<typeof filtersSchema>;
export function contactWhere(filters: Filters) {
  return {
    sql: `merged_into_id IS NULL AND ${filters.archived === 'all' ? 'true' : filters.archived === 'archived' ? 'archived_at IS NOT NULL' : 'archived_at IS NULL'} AND ($1::text IS NULL OR name ILIKE $1 ESCAPE '\\' OR email ILIKE $1 ESCAPE '\\' OR phone ILIKE $1 ESCAPE '\\') AND ($2::text IS NULL OR lifecycle=$2) AND ($3::text IS NULL OR $3=ANY(tags)) AND ($4::uuid IS NULL OR owner_id=$4)`,
    params: [
      filters.q ? '%' + filters.q.replace(/[\\%_]/g, '\\$&') + '%' : null,
      filters.lifecycle ?? null,
      filters.tag ?? null,
      filters.ownerId ?? null,
    ],
  };
}
