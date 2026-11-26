import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';

process.env.DATABASE_URL ||= 'postgres://test:test@localhost/test';
process.env.REDIS_URL ||= 'redis://localhost:6379';
process.env.JWT_SECRET ||= randomBytes(32).toString('hex');
process.env.ENCRYPTION_KEY ||= randomBytes(32).toString('hex');

test('manual unread marker is scoped to the workspace, idempotent, and emits updates', async () => {
  const { InboxController } = await import('./inbox.controller');
  const seen: Array<{ tenantId: string; conversationId: string; reason: string }> = [];
  const counts = new Map<string, number>([['company-a:chat-1', 0], ['company-a:chat-2', 3]]);
  const db = {
    withTenant: async (tenantId: string, action: (c: unknown) => Promise<unknown>) => action({
      query: async (sql: string, params: unknown[]) => {
        assert.match(sql, /GREATEST\(unread_count, 1\)/);
        const key = tenantId + ':' + params[0];
        if (!counts.has(key)) return { rowCount: 0, rows: [] };
        const unreadCount = Math.max(1, counts.get(key)!);
        counts.set(key, unreadCount);
        return { rowCount: 1, rows: [{ unread_count: unreadCount }] };
      },
    }),
  };
  const events = { emit: (_event: string, data: typeof seen[number]) => seen.push(data) };
  const inbox = new InboxController(db as never, {} as never, {} as never, {} as never, events as never, {} as never);
  const request = (tenantId: string) => ({ user: { tenantId, userId: 'agent-1', role: 'agent' } }) as never;
  assert.deepEqual(await inbox.unread(request('company-a'), 'chat-1'), { ok: true, unread_count: 1 });
  assert.deepEqual(await inbox.unread(request('company-a'), 'chat-1'), { ok: true, unread_count: 1 });
  assert.deepEqual(await inbox.unread(request('company-a'), 'chat-2'), { ok: true, unread_count: 3 });
  await assert.rejects(inbox.unread(request('company-b'), 'chat-1'), NotFoundException);
  assert.equal(seen.length, 3);
  assert.ok(seen.every((event) => event.tenantId === 'company-a' && event.reason === 'unread'));
});
