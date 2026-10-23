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
export type Conditions = z.infer<typeof filtersSchema> & {
  allOf: Conditions[];
  anyOf: Conditions[];
};
function boundedTree(keys: string[], maxDepth = 4, maxNodes = 80) {
  return z.unknown().superRefine((value, ctx) => {
    const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
    let count = 0;
    while (stack.length) {
      const item = stack.pop()!;
      if (++count > maxNodes || item.depth > maxDepth) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Workflow exceeds safe nesting or node limit',
        });
        return;
      }
      if (item.value && typeof item.value === 'object')
        for (const key of keys) {
          const next = (item.value as Record<string, unknown>)[key];
          if (Array.isArray(next))
            for (const child of next) stack.push({ value: child, depth: item.depth + 1 });
        }
    }
  });
}
const conditionTree: z.ZodType<Conditions, z.ZodTypeDef, unknown> = z.lazy(() =>
  filtersSchema.extend({
    allOf: z.array(conditionTree).max(10).default([]),
    anyOf: z.array(conditionTree).max(10).default([]),
  }),
);
export const conditionsSchema = boundedTree(['allOf', 'anyOf']).pipe(conditionTree);
export function conditionWhere(input: Conditions): { sql: string; params: unknown[] } {
  const base = contactWhere(input),
    params: unknown[] = [...base.params];
  const clause = (filter: Conditions) => {
    const next = conditionWhere(filter),
      offset = params.length;
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
export type AutomationAction =
  | z.infer<typeof baseActionSchema>
  | {
      type: 'branch';
      conditions: Conditions;
      then: AutomationAction[];
      otherwise: AutomationAction[];
    }
  | { type: 'http'; secretId?: string; url: string; body: string; headers?: Record<string, string> }
  | { type: 'delay'; delayMinutes: number; actions: AutomationAction[] };
const actionTree: z.ZodType<AutomationAction, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.union([
    baseActionSchema,
    z.object({
      type: z.literal('branch'),
      conditions: conditionsSchema,
      then: z.array(actionTree).min(1).max(10),
      otherwise: z.array(actionTree).max(10).default([]),
    }),
    z.object({
      type: z.literal('http'),
      secretId: z.string().uuid().optional(),
      headers: z
        .record(
          z.enum(['Accept', 'Content-Language', 'X-Request-Source', 'X-Correlation-Id']),
          z
            .string()
            .max(200)
            .regex(/^[\x20-\x7e]*$/),
        )
        .optional(),
      url: z
        .string()
        .url()
        .max(2000)
        .refine((value) => {
          const u = new URL(value);
          return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash;
        }, 'Use HTTPS without credentials or query secrets'),
      body: z.string().max(16000).default(''),
    }),
    z.object({
      type: z.literal('delay'),
      delayMinutes: z.number().int().min(1).max(525600),
      actions: z.array(actionTree).min(1).max(10),
    }),
  ]),
);
export const actionSchema = boundedTree(['then', 'otherwise', 'actions']).pipe(actionTree);
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
