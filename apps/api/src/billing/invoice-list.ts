import type { PoolClient } from 'pg';
import { z } from 'zod';
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value + 'T00:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });
export const invoiceListSchema = z
  .object({
    status: z
      .enum(['all', 'draft', 'open', 'paid', 'void', 'uncollectible', 'deleted', 'failed'])
      .default('all'),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce
      .number()
      .refine((value) => [5, 10, 25, 50, 100, 200, 500].includes(value))
      .default(50),
    search: z.string().trim().max(200).default(''),
    from: date.optional(),
    to: date.optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'Invalid date range' });
export async function listInvoices(
  c: Pick<PoolClient, 'query'>,
  q: z.infer<typeof invoiceListSchema>,
) {
  const predicate = `($1='all' OR status=$1 OR ($1='failed' AND payment_failed AND status='open'))
    AND ($2='' OR strpos(lower(COALESCE(number,'') || ' ' || provider_id), lower($2))>0)
    AND ($3::date IS NULL OR paid_at >= $3::date::timestamp AT TIME ZONE 'UTC')
    AND ($4::date IS NULL OR paid_at < ($4::date + 1)::timestamp AT TIME ZONE 'UTC')`;
  const values = [q.status, q.search, q.from || null, q.to || null];
  const total = (
    await c.query('SELECT count(*)::int AS n FROM billing_invoices WHERE ' + predicate, values)
  ).rows[0].n;
  const items = (
    await c.query(
      `SELECT provider_id,number,status,currency,amount_due,amount_paid,amount_remaining,
    attempted_count,payment_failed,hosted_url,pdf_url,due_at,provider_created,paid_at,updated_at
    FROM billing_invoices WHERE ${predicate}
    ORDER BY paid_at DESC NULLS LAST,provider_created DESC,provider_id LIMIT $5 OFFSET $6`,
      [...values, q.limit, (q.page - 1) * q.limit],
    )
  ).rows;
  return {
    items,
    total,
    page: q.page,
    limit: q.limit,
    filters: { status: q.status, search: q.search, from: q.from || '', to: q.to || '' },
  };
}
