import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import https from 'node:https';
import { FlowActionsService } from './flow-actions.service';

test('seven button action types execute with isolated dependencies, order and replay protection', async () => {
  const queries: { tenant: string; sql: string; params: unknown[] }[] = [];
  const receipts = new Map<string, string>();
  const events: string[] = [];
  const sequenceCalls: string[] = [];
  const providerCalls: unknown[] = [];
  const sent: { url: string; method: string; headers: Record<string, string>; body: string }[] = [];
  const tenantId = 'tenant-isolated';
  const db = {
    withTenant: async (tenant: string, fn: (c: unknown) => Promise<unknown>) =>
      fn({ query: async (sql: string, params: unknown[] = []) => {
        queries.push({ tenant, sql, params });
        if (sql.startsWith('INSERT INTO flow_action_receipts')) {
          const key = tenant + ':' + params[1];
          if (receipts.has(key)) return { rowCount: 0, rows: [] };
          receipts.set(key, String(params[2]));
          return { rowCount: 1, rows: [{ action_key: params[1] }] };
        }
        if (sql.startsWith('SELECT request_hash')) return {
          rowCount: 1, rows: [{ request_hash: receipts.get(tenant + ':' + params[0]) }],
        };
        if (sql.startsWith('SELECT provider FROM integration_connections'))
          return { rowCount: 1, rows: [{ provider: 'mailchimp' }] };
        if (sql.startsWith('SELECT 1 FROM')) return { rowCount: 1, rows: [{}] };
        return { rowCount: 1, rows: [{}] };
      } }),
    eventScope: async (_: string, fn: () => Promise<unknown>) => fn(),
  };
  const effects = { execute: async (_: string, __: unknown, fn: () => Promise<unknown>) => fn() };
  const sequences = {
    enroll: async (_t: string, id: string, contact: string) => { sequenceCalls.push('enroll:' + id + ':' + contact); },
    stopForContact: async (_t: string, id: string, contact: string) => { sequenceCalls.push('stop:' + id + ':' + contact); },
  };
  const bus = { emit: (name: string) => events.push(name) };
  const integrations = {
    execute: async (_t: string, id: string, payload: unknown) => {
      providerCalls.push({ id, payload });
      return { ok: true };
    },
  };
  const service = new FlowActionsService(db as never, effects as never, sequences as never, bus as never, undefined, integrations as never);
  const idA = '11111111-1111-4111-8111-111111111111';
  const idB = '22222222-2222-4222-8222-222222222222';
  const scope = { tenantId, contactId: idA, conversationId: idB, eventId: 'inbound-isolated' };
  const original = https.request;
  (https as unknown as { request: unknown }).request = ((url: URL, opts: {method: string; headers: Record<string,string>}, reply: (res: PassThrough) => void) => {
    const req = new EventEmitter() as EventEmitter & { write: (body: string) => void; end: () => void; destroy: (err: Error) => void };
    let body = '';
    req.write = (chunk) => { body += String(chunk); };
    req.end = () => {
      sent.push({ url: url.href, method: opts.method, headers: opts.headers, body });
      const res = new PassThrough() as PassThrough & { statusCode: number; headers: Record<string,string> };
      res.statusCode = 202;
      res.headers = {};
      reply(res);
      queueMicrotask(() => res.end('{"ok":true}'));
    };
    req.destroy = (err) => { req.emit('error', err); };
    return req;
  }) as unknown as typeof https.request;
  try {
    const actions = [
      { type: 'set_field', key: 'interest', value: 'Umrah' },
      { type: 'tag', add: ['qualified'], remove: ['lead'] },
      { type: 'list', listId: idA, operation: 'add' },
      { type: 'sequence', sequenceId: idA, operation: 'subscribe' },
      { type: 'assign', userId: idA, departmentId: idB },
      { type: 'integration', connectionId: idA, payload: JSON.stringify({ operation: 'subscribe', listId: 'local' }) },
      { type: 'webhook', url: 'https://example.test/isolated-flow', body: '{"qa":true}' },
    ] as const;
    for (const [index, action] of actions.entries()) await service.execute(scope, action, 'option:button:' + index);
    assert.ok(queries.some((q) => q.sql.startsWith('UPDATE contacts SET attributes') && q.params[1] === 'interest'));
    assert.ok(queries.some((q) => q.sql.includes('SET tags=') && (q.params[1] as string[])[0] === 'qualified'));
    assert.ok(queries.some((q) => q.sql.startsWith('INSERT INTO contact_list_members')));
    assert.equal(sequenceCalls.length, 1);
    assert.equal(events[0], 'conversation.handoff');
    assert.ok(queries.some((q) => q.sql.includes("handled_by='human'")));
    assert.equal(providerCalls.length, 1);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].method, 'POST');
    assert.equal(sent[0].headers['Content-Type'], 'application/json');
    assert.equal(sent[0].body, '{"qa":true}');
    const counts = { queries: queries.length, events: events.length, sequences: sequenceCalls.length, provider: providerCalls.length, webhook: sent.length };
    for (const [index, action] of actions.entries()) await service.execute(scope, action, 'option:button:' + index);
    assert.equal(events.length, counts.events);
    assert.equal(sequenceCalls.length, counts.sequences);
    assert.equal(providerCalls.length, counts.provider);
    assert.equal(sent.length, counts.webhook);
    assert.equal(queries.filter((q) => q.sql.startsWith('UPDATE contacts SET attributes')).length, 1);
    await assert.rejects(service.execute(scope, { type: 'set_field', key: 'interest', value: 'Changed' }, 'option:button:0'), /replay changed/i);
    assert.ok(queries.every((q) => q.tenant === tenantId), 'all database writes are tenant scoped');
    await service.execute({ ...scope, tenantId: 'other-test-tenant' }, { type: 'tag', add: ['other'], remove: [] }, 'option:button:1');
    assert.ok(queries.some((q) => q.tenant === 'other-test-tenant' && q.sql.includes('SET tags=')));
    console.log('Seven action execution branches, side effects, replay idempotency and tenant isolation PASS; HTTPS transport stubbed before networking');
  } finally {
    (https as unknown as { request: unknown }).request = original;
  }
});