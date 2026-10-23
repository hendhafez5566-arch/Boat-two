import { z } from 'zod';

const varName = z.string().regex(/^[A-Za-z_][\w]{0,40}$/);
const id = z.string().min(1).max(60);

const button = z.object({ id: z.string().min(1).max(200), title: z.string().min(1).max(20) });
const row = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(24),
  description: z.string().max(72).optional(),
});

const condition = z.object({
  source: z.enum(['variable', 'contact_field', 'contact_attribute', 'last_message', 'channel']),
  key: z.string().max(100).optional(),
  operator: z.enum([
    'equals',
    'not_equals',
    'contains',
    'not_contains',
    'starts_with',
    'ends_with',
    'greater_than',
    'less_than',
    'is_set',
    'is_not_set',
    'matches_regex',
  ]),
  value: z.string().max(500).optional(),
});

const range = z.tuple([z.string().regex(/^\d{2}:\d{2}$/), z.string().regex(/^\d{2}:\d{2}$/)]);
const day = z.array(range).max(6).optional();

const nodeBase = {
  id,
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  edges: z.record(z.string().max(250), id).default({}),
};

const messageData = z.object({
  text: z.string().max(4096).optional(),
  media: z
    .object({
      kind: z.enum(['image', 'video', 'audio', 'file']),
      url: z.string().max(2000),
      caption: z.string().max(1024).optional(),
      filename: z.string().max(200).optional(),
    })
    .optional(),
  buttons: z.array(button).max(3).optional(),
  list: z
    .object({
      buttonText: z.string().min(1).max(20),
      sections: z
        .array(
          z.object({ title: z.string().max(24).optional(), rows: z.array(row).min(1).max(10) }),
        )
        .max(10),
    })
    .optional(),
  saveReplyAs: varName.optional(),
  maxRetries: z.number().int().min(0).max(5).optional(),
});

export const nodeSchema = z.discriminatedUnion('type', [
  z.object({
    ...nodeBase,
    type: z.literal('subflow'),
    data: z.object({ flowId: z.string().uuid() }),
  }),
  z.object({ ...nodeBase, type: z.literal('message'), data: messageData }),
  z.object({
    ...nodeBase,
    type: z.literal('question'),
    data: z.object({
      text: z.string().max(4096),
      answerType: z.enum(['text', 'number', 'email', 'phone', 'regex']).default('text'),
      pattern: z.string().max(200).optional(),
      saveAs: z.string().max(41),
      retries: z.number().int().min(0).max(5).optional(),
      errorText: z.string().max(1000).optional(),
      buttons: z.array(button).max(3).optional(),
    }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal('condition'),
    data: z.object({
      rules: z
        .array(
          z.object({
            id,
            match: z.enum(['all', 'any']).default('all'),
            conditions: z.array(condition).min(1).max(10),
          }),
        )
        .max(15),
    }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal('set_variable'),
    data: z.object({
      assignments: z
        .array(
          z.object({
            name: z.string().max(41),
            operation: z.enum(['set', 'increment', 'clear']),
            value: z.string().max(1000).optional(),
          }),
        )
        .max(20),
    }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal('set_attribute'),
    data: z.object({ key: z.string().max(41), value: z.string().max(1000) }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal('delay'),
    data: z.object({
      amount: z.number().positive().max(100000),
      unit: z.enum(['seconds', 'minutes', 'hours', 'days']),
    }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal('http_request'),
    data: z.object({
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
      url: z.string().max(2000),
      headers: z
        .array(z.object({ key: z.string().max(100), value: z.string().max(1000) }))
        .max(20)
        .optional(),
      body: z.string().max(10000).optional(),
      saveAs: z
        .array(z.object({ path: z.string().max(200), variable: z.string().max(41) }))
        .max(20)
        .optional(),
      timeoutMs: z.number().int().min(500).max(15000).optional(),
    }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal('business_hours'),
    data: z.object({
      timezone: z.string().max(60),
      schedule: z.object({ mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day }),
    }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal('split'),
    data: z.object({
      branches: z
        .array(z.object({ id, weight: z.number().min(0).max(1000) }))
        .min(1)
        .max(10),
    }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal('ai_reply'),
    data: z.object({
      instructions: z.string().max(2000).optional(),
      greeting: z.string().max(1000).optional(),
      maxTurns: z.number().int().min(1).max(50).optional(),
      exitKeywords: z.array(z.string().min(1).max(60)).max(20).optional(),
      answerFirst: z.boolean().optional(),
      saveAnswerAs: z.string().max(41).optional(),
    }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal('handoff'),
    data: z.object({
      message: z.string().max(2000).optional(),
      assignTo: z.string().uuid().optional().or(z.literal('')),
    }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal('end'),
    data: z.object({
      message: z.string().max(2000).optional(),
      closeConversation: z.boolean().optional(),
    }),
  }),
]);

export const graphSchema = z.object({
  startNodeId: z.string().max(60),
  nodes: z.array(nodeSchema).max(300),
});

export const triggersSchema = z
  .array(
    z.discriminatedUnion('type', [
      z.object({
        type: z.literal('event'),
        event: z.enum([
          'crm.contacts.insert',
          'crm.contacts.update',
          'crm.crm_deals.insert',
          'crm.crm_deals.update',
          'crm.crm_tasks.update',
        ]),
      }),
      z.object({
        type: z.literal('keyword'),
        keywords: z.array(z.string().min(1).max(100)).min(1).max(50),
        match: z.enum(['contains', 'exact', 'starts_with']).default('contains'),
      }),
      z.object({
        type: z.literal('reply_id'),
        ids: z.array(z.string().min(1).max(200)).min(1).max(50),
      }),
      z.object({ type: z.literal('first_message') }),
      z.object({ type: z.literal('any_message') }),
    ]),
  )
  .max(10);

export const createFlowSchema = z.object({
  language: z.enum(['ar', 'en']).default('ar'),
  isComponent: z.boolean().default(false),
  templateId: z.string().max(40).optional(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});

export const updateFlowSchema = z.object({
  isComponent: z.boolean().optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  priority: z.number().int().min(-100).max(100).optional(),
  triggers: triggersSchema.optional(),
  channelIds: z.array(z.string().uuid()).max(50).optional(),
  graph: graphSchema.optional(),
});

export const testFlowSchema = z.object({
  state: z.unknown().optional(),
  text: z.string().max(2000).default(''),
  replyId: z.string().max(200).optional(),
  advanceDelay: z.boolean().optional(),
  allowHttp: z.boolean().optional(),
});
