import { z } from 'zod';
import { isValidTimezone } from './engine/hours';

const varName = z.string().regex(/^[A-Za-z_][\w]{0,40}$/);
const id = z.string().min(1).max(60);

export const buttonActionSchema = z.discriminatedUnion('type', [
  z.object({type:z.literal('integration'),connectionId:z.string().uuid(),payload:z.string().min(2).max(10000)}),
  z.object({ type: z.literal('set_field'), key: varName, value: z.string().max(2000) }),
  z.object({ type: z.literal('tag'), add: z.array(z.string().min(1).max(80)).max(30), remove: z.array(z.string().min(1).max(80)).max(30) }),
  z.object({ type: z.literal('list'), listId: z.string().uuid(), operation: z.enum(['add', 'remove']) }),
  z.object({ type: z.literal('sequence'), sequenceId: z.string().uuid(), operation: z.enum(['subscribe', 'unsubscribe']) }),
  z.object({ type: z.literal('assign'), userId: z.string().uuid().optional(), departmentId: z.string().uuid().optional() }),
  z.object({ type: z.literal('webhook'), url: z.string().url().max(2000).refine(v => v.startsWith('https://')), body: z.string().max(10000).default('{}') }),
]);
const actions = z.array(buttonActionSchema).max(20).optional();
const button = z.object({ id: z.string().min(1).max(200), title: z.string().min(1).max(20), actions });
const row = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(24),
  description: z.string().max(72).optional(),
  actions,
});

const condition = z.object({
  source: z.enum(['variable', 'contact_field', 'contact_attribute', 'last_message', 'channel', 'label']),
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
  /** Editor-only sticky comment; the engine ignores it. */
  note: z.string().max(500).optional(),
  /** Editor-only: canvas position of each button card (buttonId → position); the engine ignores it. */
  layout: z.record(z.string().max(60), z.object({ x: z.number(), y: z.number() })).optional(),
  edges: z.record(z.string().max(250), id).default({}),
};

const messageData = z.object({
  header: z.discriminatedUnion('type',[z.object({type:z.literal('text'),text:z.string().max(60)}),z.object({type:z.literal('image'),url:z.string().url().max(2000)})]).optional(),
  footer: z.string().max(60).optional(),
  delivery: z.object({delaySeconds:z.number().int().min(0).max(604800),typingSeconds:z.number().int().min(0).max(5).optional()}).optional(),
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
  z.object({...nodeBase,type:z.literal('product'),data:z.object({productId:z.string().uuid(),native:z.boolean().default(false)})}),
  z.object({...nodeBase,type:z.literal('catalog'),data:z.object({productIds:z.array(z.string().uuid()).min(1).max(30),native:z.boolean().default(false),text:z.string().min(1).max(1024)})}),
  z.object({...nodeBase,type:z.literal('appointment'),data:z.object({serviceId:z.string().uuid(),start:z.string().min(1).max(200),saveAs:varName.default('appointment')})}),
  z.object({...nodeBase,type:z.literal('whatsapp_flow'),data:z.object({text:z.string().min(1).max(1024),flowId:z.string().regex(/^\d+$/),cta:z.string().min(1).max(20),screen:z.string().min(1).max(80),saveAs:varName.default('form')})}),
  z.object({
    ...nodeBase,
    type: z.literal('subflow'),
    data: z.object({ flowId: z.string().uuid() }),
  }),
  z.object({ ...nodeBase, type: z.literal('message'), data: messageData }),
  z.object({ ...nodeBase, type: z.literal('interactive'), data: messageData }),
  z.object({
    ...nodeBase,
    type: z.literal('location'),
    data: z.object({
      lat: z.string().max(40),
      lng: z.string().max(40),
      name: z.string().max(100).optional(),
      address: z.string().max(300).optional(),
    }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal('cta_url'),
    data: z.object({
      text: z.string().min(1).max(1024),
      buttonText: z.string().min(1).max(20),
      url: z.string().min(1).max(2000),
      imageUrl: z.string().max(2000).optional(),
    }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal('sequence'),
    data: z.object({ sequenceId: z.string().uuid().or(z.literal('')) }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal('template'),
    data: z.object({
      name: z.string().regex(/^[a-z0-9_]{1,512}$/),
      language: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/).default('ar'),
      bodyParams: z.array(z.string().max(1024)).max(20).default([]),
      header: z
        .discriminatedUnion('type', [
          z.object({ type: z.literal('text'), text: z.string().max(60) }),
          z.object({
            type: z.enum(['image', 'video', 'document']),
            url: z.string().max(2048),
            filename: z.string().max(200).optional(),
          }),
        ])
        .optional(),
    }),
  }),
  ...(['image', 'audio', 'video', 'file'] as const).map((kind) =>
    z.object({
      ...nodeBase,
      type: z.literal(kind),
      data: z.object({
        url: z.string().max(2000).default(''),
        caption: z.string().max(1024).optional(),
        filename: z.string().max(200).optional(),
      }),
    }),
  ),
  z.object({
    ...nodeBase,
    type: z.literal('user_input'),
    data: z.object({
      name: z.string().max(120).default(''),
      questions: z
        .array(
          z.object({
            id: z.string().min(1).max(40),
            text: z.string().max(1024),
            kind: z.enum(['choice', 'text', 'number', 'email', 'phone']).default('text'),
            options: z.array(z.object({ id: z.string().min(1).max(200), title: z.string().min(1).max(24) })).max(10).optional(),
            saveAs: z.string().max(41),
            saveToSystem:z.enum(['name','email','phone']).optional(),
            allowSkip: z.boolean().optional(),
            skipText: z.string().min(1).max(20).optional(),
            errorText: z.string().max(1000).optional(),
            retries: z.number().int().min(0).max(5).optional(),
          }),
        )
        .max(20)
        .default([]),
      doneText: z.string().max(4096).default(''),
      completionActions: actions,
    }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal('question'),
    data: z.object({
      text: z.string().max(4096),
      answerType: z.enum(['text', 'number', 'email', 'phone', 'regex']).default('text'),
      saveToSystem:z.enum(['name','email','phone']).optional(),
      allowSkip: z.boolean().optional(),
      skipText: z.string().min(1).max(20).optional(),
      saveToContact: z.boolean().optional(),
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
    type: z.literal('tag'),
    data: z.object({
      add: z.array(z.string().max(40)).max(10).default([]),
      remove: z.array(z.string().max(40)).max(10).default([]),
    }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal('note'),
    data: z.object({ body: z.string().max(2000) }),
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
    type: z.literal('sheet_fetch'),
    data: z.object({
      connectionId:z.string().uuid().optional(),
      spreadsheetId:z.string().max(200).optional(),
      range:z.string().max(200).optional(),
      url: z.string().max(2000),
      lookupColumn: z.string().max(100).optional(),
      lookupValue: z.string().max(500).optional(),
      saveAs: z
        .array(z.object({ column: z.string().max(100), variable: z.string().max(41) }))
        .max(20)
        .optional(),
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
    type: z.literal('random_number'),
    data: z.object({
      min: z.number().int().min(-1000000000).max(1000000000).default(1),
      max: z.number().int().min(-1000000000).max(1000000000).default(100),
      saveAs: z.string().max(41).default('random_number'),
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
      departmentId: z.string().uuid().optional().or(z.literal('')),
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

const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const businessDay = z.array(z.tuple([clock, clock])).max(6).optional();
export const botPolicySchema = z.object({
  initialVars:z.record(varName,z.union([z.string().max(2000),z.number().finite(),z.boolean(),z.null()])).optional(),
  startMessage:z.string().max(1000).optional(),
  startFrequency:z.enum(['once','always','daily']).optional(),
  sessionHours: z.number().int().min(1).max(168).optional(),
  noMatchText: z.string().max(1000).optional(),
  businessHours: z.object({
    enabled: z.boolean(),
    timezone: z.string().refine(isValidTimezone, 'Invalid timezone'),
    schedule: z.object({ mon:businessDay,tue:businessDay,wed:businessDay,thu:businessDay,fri:businessDay,sat:businessDay,sun:businessDay }),
    offHoursText: z.string().max(1000).optional(),
    offHoursFlowId:z.string().uuid().optional(),
  }).refine(v => !v.enabled || Object.values(v.schedule).some(day => day?.some(([start,end]) => start !== end)), 'Add at least one business-hours interval').optional(),
});

export const graphSchema = z.object({
  policy: botPolicySchema.optional(),
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

export const flowTransferSchema = z.object({
  format: z.literal('boat-two-flow'),
  version: z.literal(1),
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  graph: graphSchema,
  triggers: triggersSchema.default([]),
});

export const updateFlowSchema = z.object({
  folderName: z.string().trim().min(1).max(80).nullable().optional(),
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
  contactAttributes: z.record(z.union([z.string().max(2000),z.number(),z.boolean(),z.null()])).optional(),
  state: z.unknown().optional(),
  text: z.string().max(2000).default(''),
  replyId: z.string().max(200).optional(),
  advanceDelay: z.boolean().optional(),
  allowHttp: z.boolean().optional(),
  simulateAt: z.string().datetime().optional(),
});
