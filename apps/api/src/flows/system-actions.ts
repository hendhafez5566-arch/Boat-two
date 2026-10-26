import { z } from 'zod';
export const SYSTEM_ACTION_KEYS = [
  'get_started',
  'no_match',
  'location_reply',
  'unsubscribe',
  'resubscribe',
  'human',
  'bot',
] as const;
export type SystemActionKey = (typeof SYSTEM_ACTION_KEYS)[number];
const entry = z
  .object({
    enabled: z.boolean().default(false),
    flowId: z.string().uuid().nullable().default(null),
    keywords: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  })
  .refine((value) => !value.enabled || !!value.flowId, 'Choose a published flow');
export const systemActionsSchema = z
  .object({
    revision: z.number().int().min(0).default(0),
    actions: z.record(z.enum(SYSTEM_ACTION_KEYS), entry).default({}),
  })
  .superRefine((config, ctx) => {
    const seen = new Set<string>();
    for (const key of ['unsubscribe', 'resubscribe', 'human', 'bot'] as const) {
      const action = config.actions[key];
      if (!action?.enabled) continue;
      if (!action.keywords.length)
        ctx.addIssue({
          code: 'custom',
          path: ['actions', key, 'keywords'],
          message: 'Add at least one exact keyword',
        });
      for (const keyword of action.keywords) {
        const word = keyword.normalize('NFKC').trim().toLowerCase();
        if (seen.has(word))
          ctx.addIssue({
            code: 'custom',
            path: ['actions', key, 'keywords'],
            message: 'Action keywords must be unique',
          });
        seen.add(word);
      }
    }
  });
export type SystemActions = z.infer<typeof systemActionsSchema>;
export function readSystemActions(settings: unknown): SystemActions {
  const value =
    settings && typeof settings === 'object'
      ? (settings as Record<string, unknown>).systemActions
      : undefined;
  const parsed = systemActionsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : { revision: 0, actions: {} };
}
const normalized = (value: string) => value.normalize('NFKC').trim().toLowerCase();
export function inboundSystemAction(
  config: SystemActions,
  input: { text: string; location: boolean; human: boolean },
): SystemActionKey | null {
  for (const key of ['unsubscribe', 'resubscribe', 'human', 'bot'] as const) {
    const action = config.actions[key];
    if (input.human && key !== 'bot') continue;
    if (
      action?.enabled &&
      action.flowId &&
      action.keywords.some((keyword) => normalized(keyword) === normalized(input.text))
    )
      return key;
  }
  return !input.human && input.location && config.actions.location_reply?.enabled
    ? 'location_reply'
    : null;
}
