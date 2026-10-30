import { z } from 'zod';
export const providerSchema = z.enum([
  'google',
  'webhook',
  'mailchimp',
  'brevo',
  'activecampaign',
  'mautic',
  'email',
  'sms',
  'salla',
]);
export const EVENT_TYPES = [
  'message.received',
  'message.outbound',
  'message.status',
  'conversation.updated',
  'conversation.handoff',
  'crm.contacts.insert',
  'crm.contacts.update',
  'crm.crm_deals.insert',
  'crm.crm_deals.update',
  'crm.crm_tasks.insert',
  'crm.crm_tasks.update',
  'automation.scheduled',
] as const;
export const connectionSchema = z.object({
  provider: providerSchema.exclude(['google']),
  name: z.string().trim().min(1).max(100),
  credential: z.string().min(1).max(4000),
  config: z.object({
    url: z
      .string()
      .url()
      .refine((v) => v.startsWith('https://'))
      .optional(),
    listId: z.string().max(200).optional(),
    eventTypes: z.array(z.enum(EVENT_TYPES)).max(20).default([]),
  }),
});
export const googleOperationSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('sheet_metadata'),
    spreadsheetId: z.string().regex(/^[\w-]{10,200}$/),
  }),
  z.object({ operation: z.literal('sheet_files') }),
  z.object({ operation: z.literal('contacts_read'), pageToken: z.string().max(2000).optional() }),
  z.object({ operation: z.literal('contacts_import'), pageToken: z.string().max(2000).optional() }),
  z.object({
    operation: z.literal('sheet_read'),
    spreadsheetId: z.string().regex(/^[\w-]{10,200}$/),
    range: z.string().min(1).max(200),
  }),
  z.object({
    operation: z.literal('sheet_append'),
    spreadsheetId: z.string().regex(/^[\w-]{10,200}$/),
    range: z.string().min(1).max(200),
    values: z
      .array(z.array(z.union([z.string().max(2000), z.number(), z.boolean()])).max(100))
      .max(100),
  }),
  z.object({
    operation: z.literal('calendar_event'),
    calendarId: z.string().min(1).max(200),
    summary: z.string().min(1).max(200),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    timezone: z.string().max(100).default('UTC'),
    description: z.string().max(2000).optional(),
  }),
]);
export type GoogleOperation = z.infer<typeof googleOperationSchema>;
export function googleRequest(input: GoogleOperation) {
  if (input.operation === 'sheet_files')
    return {
      scope: 'https://www.googleapis.com/auth/drive.metadata.readonly',
      method: 'GET',
      url:
        'https://www.googleapis.com/drive/v3/files?' +
        new URLSearchParams({
          q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
          pageSize: '100',
          fields: 'files(id,name)',
        }),
      body: undefined,
    };
  if (input.operation === 'sheet_metadata')
    return {
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      method: 'GET',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${input.spreadsheetId}?fields=sheets.properties,title`,
      body: undefined,
    };

  if (input.operation === 'contacts_read' || input.operation === 'contacts_import') {
    const query = new URLSearchParams({
      personFields: 'names,emailAddresses,phoneNumbers',
      pageSize: '100',
    });
    if (input.pageToken) query.set('pageToken', input.pageToken);
    return {
      scope: 'https://www.googleapis.com/auth/contacts.readonly',
      method: 'GET',
      url: 'https://people.googleapis.com/v1/people/me/connections?' + query,
      body: undefined,
    };
  }
  if (input.operation === 'calendar_event') {
    if (new Date(input.end) <= new Date(input.start))
      throw new Error('Event end must follow start');
    return {
      scope: 'https://www.googleapis.com/auth/calendar.events',
      method: 'POST',
      url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events?sendUpdates=none`,
      body: {
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.start, timeZone: input.timezone },
        end: { dateTime: input.end, timeZone: input.timezone },
      },
    };
  }
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${input.spreadsheetId}/values/${encodeURIComponent(input.range)}`;
  return input.operation === 'sheet_read'
    ? {
        scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
        method: 'GET',
        url,
        body: undefined,
      }
    : {
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        method: 'POST',
        url: url + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
        body: { values: input.values },
      };
}
export function valuesCsv(rows: unknown[][]) {
  return rows
    .map((row) => row.map((cell) => '"' + String(cell ?? '').replace(/"/g, '""') + '"').join(','))
    .join('\n');
}

export function googleContactsPage(data: unknown) {
  const person = z.object({
    resourceName: z.string().regex(/^people\/[\w-]+$/),
    names: z.array(z.object({ displayName: z.string() })).optional(),
    emailAddresses: z.array(z.object({ value: z.string() })).optional(),
    phoneNumbers: z
      .array(z.object({ value: z.string().optional(), canonicalForm: z.string().optional() }))
      .optional(),
  });
  const page = z
    .object({
      connections: z.array(z.unknown()).max(1000).default([]),
      nextPageToken: z.string().optional(),
    })
    .parse(data);
  const seen = new Set<string>();
  const contacts: {
    resourceName: string;
    name: string;
    email: string | null;
    phone: string | null;
  }[] = [];
  for (const raw of page.connections) {
    const p = person.safeParse(raw);
    if (!p.success || seen.has(p.data.resourceName)) continue;
    const v = p.data;
    seen.add(v.resourceName);
    const email =
      v.emailAddresses
        ?.map((x) => x.value.trim().toLowerCase())
        .find((x) => z.string().email().safeParse(x).success) ?? null;
    const phone =
      v.phoneNumbers
        ?.map((x) => (x.canonicalForm ?? x.value ?? '').replace(/[ ()-]/g, ''))
        .find((x) => /^\+?[0-9]{7,15}$/.test(x)) ?? null;
    const name = v.names?.[0]?.displayName.trim().slice(0, 120) || email || phone;
    if (name) contacts.push({ resourceName: v.resourceName, name, email, phone });
  }
  return {
    contacts,
    nextPageToken: page.nextPageToken,
    skipped: page.connections.length - contacts.length,
  };
}
