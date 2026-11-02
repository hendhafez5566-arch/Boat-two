import { z } from 'zod';
export const notificationKinds = [
  'new_lead',
  'unassigned',
  'task_due',
  'task_overdue',
  'awaiting_reply',
  'stale_deal',
  'closing_deal',
  'assigned',
  'automation',
] as const;
export const notificationSettingsSchema = z
  .object({
    enabled: z.boolean().default(true),
    kinds: z
      .array(z.enum(notificationKinds))
      .max(9)
      .default([...notificationKinds]),
    dueMinutes: z.number().int().min(1).max(10080).default(60),
    replyMinutes: z.number().int().min(1).max(10080).default(30),
    staleDays: z.number().int().min(1).max(365).default(14),
    closingDays: z.number().int().min(1).max(90).default(3),
    targetIds: z.array(z.string().uuid()).max(100).default([]),
    highPriority: z
      .array(z.enum(notificationKinds))
      .max(9)
      .default(['task_overdue', 'awaiting_reply']),
  })
  .strict();
export const assignmentPolicySchema = z
  .object({
    enabled: z.boolean().default(false),
    method: z.enum(['round_robin', 'least_loaded', 'rules']).default('round_robin'),
    memberIds: z.array(z.string().uuid()).max(100).default([]),
    maxOpenPerAgent: z.number().int().min(1).max(500).optional(),
    rules: z
      .array(
        z
          .object({
            channelId: z.string().uuid().optional(),
            departmentId: z.string().uuid().optional(),
            tag: z.string().trim().min(1).max(50).optional(),
            fieldKey: z
              .string()
              .trim()
              .regex(/^[a-zA-Z_][a-zA-Z0-9_]{0,99}$/)
              .optional(),
            fieldValue: z.string().trim().min(1).max(200).optional(),
            memberIds: z.array(z.string().uuid()).min(1).max(100),
          })
          .strict()
          .refine(
            (x) => !!x.fieldKey === !!x.fieldValue,
            'Service field and value are required together',
          ),
      )
      .max(30)
      .default([]),
  })
  .strict();
export const scoringSignalsSchema = z
  .object({
    recentDays: z.number().int().min(1).max(365).default(7),
    recentPoints: z.number().int().min(0).max(100).default(0),
    interactionsRequired: z.number().int().min(1).max(1000).default(3),
    interactionPoints: z.number().int().min(0).max(100).default(0),
    inactivePoints: z.number().int().min(-100).max(0).default(0),
    interestField: z.string().trim().max(100).default(''),
    interestValue: z.string().trim().max(200).default(''),
    interestPoints: z.number().int().min(0).max(100).default(0),
    lostPoints: z.number().int().min(-100).max(0).default(0),
    hotAt: z.number().int().min(1).max(100).default(70),
    warmAt: z.number().int().min(0).max(99).default(30),
  })
  .strict()
  .refine((x) => x.hotAt > x.warmAt, 'Hot threshold must exceed warm threshold');
