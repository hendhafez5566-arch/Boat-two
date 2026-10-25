import { z } from 'zod';
import { contentSchema } from '../messaging/message-content';

const condition = z.object({
  source: z.enum(['variable', 'contact_field', 'contact_attribute', 'last_message', 'channel', 'label']),
  key: z.string().max(100).optional(),
  operator: z.enum([
    'equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with',
    'greater_than', 'less_than', 'is_set', 'is_not_set', 'matches_regex',
  ]),
  value: z.string().max(500).optional(),
});

export const stepSchema = z.object({
  id: z.string().min(1).max(40),
  delay: z.object({
    amount: z.number().int().min(0).max(525600),
    unit: z.enum(['minutes', 'hours', 'days']),
  }),
  sendAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  content: contentSchema,
  condition: z
    .object({ match: z.enum(['all', 'any']).default('all'), conditions: z.array(condition).min(1).max(10) })
    .optional(),
});

export const sequenceSchema = z.object({
  name: z.string().min(1).max(120),
  channelId: z.string().uuid(),
  timezone: z.string().max(60).default('UTC'),
  deliveryTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  stopOnReply: z.boolean().default(true),
  steps: z.array(stepSchema).max(30).default([]),
});

export type SequenceStep = z.infer<typeof stepSchema>;
