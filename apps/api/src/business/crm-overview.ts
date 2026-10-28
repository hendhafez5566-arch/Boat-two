import { z } from 'zod';
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const d = new Date(value + 'T00:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }, 'Invalid date');
export const overviewSchema = z
  .object({
    expectedContactUpdatedAt: z.string().datetime(),
    expectedDealId: z.string().uuid().nullable(),
    expectedDealUpdatedAt: z.string().datetime().nullable(),
    leadScore: z.union([z.enum(['hot', 'warm', 'cold']), z.number().min(0).max(100)]).nullable(),
    source: z.string().trim().max(200).nullable(),
    deal: z
      .object({
        pipelineId: z.string().uuid(),
        stage: z.string().trim().min(1).max(60),
        title: z.string().trim().min(1).max(200),
        valueCents: z.number().int().min(0).max(100000000000),
        currency: z.string().regex(/^[A-Z]{3}$/),
        expectedClose: date.nullable(),
        ownerId: z.string().uuid().nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine(
    (b) => !b.expectedDealId || (!!b.deal && !!b.expectedDealUpdatedAt),
    'An existing deal requires its version and values',
  );
export type OverviewInput = z.infer<typeof overviewSchema>;
