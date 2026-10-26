import { z } from 'zod';
const labels = z.array(z.string().trim().min(1).max(50)).max(30).default([]);
const lists = z.array(z.string().uuid()).max(30).default([]);
export const sequenceAudienceSchema = z
  .object({
    includeLabels: labels,
    excludeLabels: labels,
    includeLists: lists,
    excludeLists: lists,
    field: z
      .object({
        key: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,59}$/),
        value: z.string().max(2000),
      })
      .optional(),
  })
  .strict();
export type SequenceAudience = z.infer<typeof sequenceAudienceSchema>;
export function sequenceAudienceWhere(channelId: string, audience: SequenceAudience) {
  const params: unknown[] = [channelId];
  const clauses = [
    'c.archived_at IS NULL',
    'c.merged_into_id IS NULL',
    'EXISTS(SELECT 1 FROM contact_channels cc WHERE cc.contact_id=c.id AND cc.channel_id=$1 AND cc.blocked_at IS NULL)',
    "EXISTS(SELECT 1 FROM contact_consents consent WHERE consent.contact_id=c.id AND consent.channel_id=$1 AND consent.status='opted_in')",
    'EXISTS(SELECT 1 FROM channel_delivery_policy policy WHERE policy.channel_id=$1 AND policy.marketing_enabled)',
  ];
  const add = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (audience.includeLabels.length)
    clauses.push(`COALESCE(c.tags,'{}') && ${add(audience.includeLabels)}::text[]`);
  if (audience.excludeLabels.length)
    clauses.push(`NOT(COALESCE(c.tags,'{}') && ${add(audience.excludeLabels)}::text[])`);
  if (audience.includeLists.length)
    clauses.push(
      `EXISTS(SELECT 1 FROM contact_list_members lm WHERE lm.contact_id=c.id AND lm.list_id=ANY(${add(audience.includeLists)}::uuid[]))`,
    );
  if (audience.excludeLists.length)
    clauses.push(
      `NOT EXISTS(SELECT 1 FROM contact_list_members lm WHERE lm.contact_id=c.id AND lm.list_id=ANY(${add(audience.excludeLists)}::uuid[]))`,
    );
  if (audience.field)
    clauses.push(`c.attributes->>${add(audience.field.key)}=${add(audience.field.value)}`);
  return { sql: clauses.join(' AND '), params };
}
export const sequenceCenterQuery = z.object({
  channelId: z.string().uuid().optional(),
  q: z.string().max(100).default(''),
  status: z.enum(['all', 'draft', 'active', 'paused']).default('all'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sort: z.enum(['latest', 'name', 'last_sent']).default('latest'),
});
