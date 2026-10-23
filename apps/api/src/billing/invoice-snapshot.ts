import { z } from 'zod';
const amount = z.number().int().min(0).max(9000000000000);
const timestamp = z.number().int().min(0).max(253402300799);
const schema = z.object({
  id: z
    .string()
    .regex(/^in_[A-Za-z0-9_]+$/)
    .max(255),
  number: z.string().max(255).nullable().optional(),
  status: z.enum(['draft', 'open', 'paid', 'void', 'uncollectible']).nullable().optional(),
  currency: z.string().regex(/^[a-z]{3}$/),
  amount_due: amount,
  amount_paid: amount,
  amount_remaining: amount,
  attempt_count: z.number().int().min(0).max(1000000).default(0),
  created: timestamp,
  due_date: timestamp.nullable().optional(),
  status_transitions: z.object({ paid_at: timestamp.nullable().optional() }).optional(),
  hosted_invoice_url: z.string().max(4000).nullable().optional(),
  invoice_pdf: z.string().max(4000).nullable().optional(),
});
export function safeInvoiceUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (url.hostname === 'stripe.com' || url.hostname.endsWith('.stripe.com'))
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function invoiceSnapshot(type: string, input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return null;
  const invoice = parsed.data;
  const status =
    type === 'invoice.deleted'
      ? 'deleted'
      : type === 'invoice.paid' || type === 'invoice.payment_succeeded'
        ? 'paid'
        : type === 'invoice.voided'
          ? 'void'
          : type === 'invoice.marked_uncollectible'
            ? 'uncollectible'
            : (invoice.status ?? 'open');
  const rank =
    type === 'invoice.payment_failed'
      ? 2
      : { draft: 0, open: 1, uncollectible: 3, void: 4, deleted: 5, paid: 6 }[status];
  return {
    ...invoice,
    status,
    rank,
    hosted_invoice_url: safeInvoiceUrl(invoice.hosted_invoice_url),
    invoice_pdf: safeInvoiceUrl(invoice.invoice_pdf),
  };
}
