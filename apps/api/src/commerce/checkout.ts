import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const money = z.string().regex(/^\d{1,15}$/);
const key = z.string().uuid();
const label = z.string().trim().min(1).max(120);

export const checkoutSchema = z.object({
  kind: z.enum(['product', 'service', 'appointment', 'quote']).default('product'),
  packages: z.array(z.object({ id: key, name: label, priceCents: money })).max(30).default([]),
  questions: z.array(z.object({
    id: key,
    label,
    type: z.enum(['text', 'textarea', 'number', 'date', 'list']),
    required: z.boolean(),
    choices: z.array(label).max(30).default([]),
    packageId: key.optional(),
  })).max(40).default([]),
  documents: z.array(label).max(20).default([]),
  stock: z.number().int().min(0).max(1_000_000).nullable().default(null),
  min: z.number().int().min(1).max(1000).default(1),
  max: z.number().int().min(1).max(1000).default(1000),
  discountBps: z.number().int().min(0).max(10000).default(0),
  taxBps: z.number().int().min(0).max(10000).default(0),
}).superRefine((config, ctx) => {
  const ids = new Set(config.packages.map((item) => item.id));
  const invalid =
    config.min > config.max || ids.size !== config.packages.length ||
    new Set(config.questions.map((item) => item.id)).size !== config.questions.length ||
    config.questions.some((q) =>
      (q.packageId !== undefined && !ids.has(q.packageId)) ||
      (q.type === 'list' && (!q.choices.length || new Set(q.choices).size !== q.choices.length)),
    );
  if (invalid) ctx.addIssue({ code: 'custom', message: 'Invalid quantity limits, duplicate IDs, or question choices/package' });
});

const selection = {
  productId: key,
  packageId: key.optional(),
  quantity: z.number().int().min(1).max(1000),
  options: z.array(z.string().min(1).max(120)).max(100).default([]),
  answers: z.array(z.object({ id: key, value: z.string().trim().max(1500) })).max(40).default([]),
};
export const selectionSchema = z.object(selection);
export const orderSchema = z.object({
  ...selection,
  contactId: key,
  requestId: key,
});
export const conversationOrderSchema = orderSchema.omit({ contactId: true }).extend({
  channelId: key,
  conversationId: key,
}).strict();
export type Selection = z.infer<typeof selectionSchema>;
export type CheckoutProduct = {
  id: string;
  name: string;
  currency: string;
  price_cents: string;
  checkout: unknown;
  options: { name: string; priceCents: string }[];
};

export function calculateCheckout(product: CheckoutProduct, input: Selection, preview = false) {
  const config = checkoutSchema.parse(product.checkout ?? {});
  const pack = config.packages.find((p) => p.id === input.packageId);
  if ((input.packageId || config.packages.length) && !pack) throw new BadRequestException('Select a valid package');
  if (input.quantity < config.min || input.quantity > config.max ||
      (config.stock !== null && config.stock < input.quantity))
    throw new BadRequestException('Quantity unavailable');
  const options = input.options.map((name) => {
    const matches = product.options.filter((option) => option.name === name);
    if (matches.length !== 1) throw new BadRequestException('Unknown or ambiguous option');
    return matches[0];
  });
  if (new Set(input.options).size !== options.length) throw new BadRequestException('Duplicate option');
  const questions = config.questions.filter((q) => !q.packageId || q.packageId === pack?.id);
  const answers = new Map(input.answers.map((a) => [a.id, a.value]));
  if (answers.size !== input.answers.length || input.answers.some((a) => !questions.some((q) => q.id === a.id)))
    throw new BadRequestException('Unexpected or duplicate answer');
  for (const q of questions) {
    const value = answers.get(q.id);
    if ((!preview && q.required && !value) || (value && (
      (q.type === 'number' && (!/^-?\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value)))) ||
      (q.type === 'date' && (!z.iso.date().safeParse(value).success)) ||
      (q.type === 'list' && !q.choices.includes(value))
    ))) throw new BadRequestException('Invalid answer: ' + q.label);
  }
  const price = BigInt(pack?.priceCents ?? product.price_cents);
  const unit = options.reduce((total, option) => total + BigInt(option.priceCents), price);
  const subtotal = unit * BigInt(input.quantity);
  const discount = (subtotal * BigInt(config.discountBps) + 5000n) / 10000n;
  const tax = ((subtotal - discount) * BigInt(config.taxBps) + 5000n) / 10000n;
  const priced = config.kind !== 'quote';
  return {
    productId: product.id, name: product.name, kind: config.kind, currency: product.currency,
    package: pack ?? null, options, quantity: input.quantity, questions, answers: input.answers,
    documents: config.documents, stockTracked: config.stock !== null && config.kind !== 'quote', unitCents: priced ? unit.toString() : null,
    subtotalCents: priced ? subtotal.toString() : null, discountCents: priced ? discount.toString() : null,
    taxCents: priced ? tax.toString() : null, totalCents: priced ? (subtotal - discount + tax).toString() : null,
  };
}
