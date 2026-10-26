import { createHash } from 'node:crypto';
import { z } from 'zod';
export const FLOW_CATEGORIES = [
  'SIGN_UP',
  'SIGN_IN',
  'APPOINTMENT_BOOKING',
  'LEAD_GENERATION',
  'CONTACT_US',
  'CUSTOMER_SUPPORT',
  'SURVEY',
  'OTHER',
] as const;
// Structural checks only. Meta's asset validator decides whether a definition can be published.
export const flowDefinitionSchema = z
  .object({
    version: z.string().regex(/^\d+\.\d+$/),
    screens: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            title: z.string().max(100).optional(),
            layout: z.record(z.unknown()),
          })
          .passthrough(),
      )
      .min(1)
      .max(100),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (new Set(value.screens.map((screen) => screen.id)).size !== value.screens.length)
      ctx.addIssue({ code: 'custom', message: 'Screen IDs must be unique' });
    if (Buffer.byteLength(JSON.stringify(value)) > 1024 * 1024)
      ctx.addIssue({
        code: 'custom',
        message: 'Flow definition exceeds this workspace’s 1 MiB limit',
      });
  });
export const nativeFlowDraftSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    categories: z.array(z.enum(FLOW_CATEGORIES)).min(1).max(8),
    definition: flowDefinitionSchema,
  })
  .strict();
export const flowRevisionSchema = z.object({ revision: z.number().int().positive() }).strict();
export function definitionHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export const providerFlowSchema = z.object({
  id: z.string().regex(/^\d+$/),
  name: z.string(),
  categories: z.array(z.string()),
  status: z.string(),
  validation_errors: z.array(z.record(z.unknown())).default([]),
  whatsapp_business_account: z.object({ id: z.string() }).optional(),
  preview: z.object({ preview_url: z.string(), expires_at: z.string() }).optional(),
});
export type ProviderFlow = z.infer<typeof providerFlowSchema>;
export function safeFlowPreview(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.hostname === 'business.facebook.com' &&
      !url.username &&
      !url.password &&
      url.pathname.startsWith('/wa/manage/flows/')
      ? url.href
      : null;
  } catch {
    return null;
  }
}
