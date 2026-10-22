import { z } from 'zod';
export const filtersSchema = z.object({
  q: z.string().max(100).optional(),
  lifecycle: z.enum(['lead', 'qualified', 'customer', 'inactive']).optional(),
  tag: z.string().max(50).optional(),
  ownerId: z.string().uuid().optional(),
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
  conditions: filtersSchema.default({}),
  actions: z.array(actionSchema).min(1).max(10),
});
export type Filters = z.infer<typeof filtersSchema>;
export function contactWhere(filters: Filters) {
  return {
    sql: `($1::text IS NULL OR name ILIKE $1 ESCAPE '\\' OR email ILIKE $1 ESCAPE '\\' OR phone ILIKE $1 ESCAPE '\\') AND ($2::text IS NULL OR lifecycle=$2) AND ($3::text IS NULL OR $3=ANY(tags)) AND ($4::uuid IS NULL OR owner_id=$4)`,
    params: [
      filters.q ? '%' + filters.q.replace(/[\\%_]/g, '\\$&') + '%' : null,
      filters.lifecycle ?? null,
      filters.tag ?? null,
      filters.ownerId ?? null,
    ],
  };
}
