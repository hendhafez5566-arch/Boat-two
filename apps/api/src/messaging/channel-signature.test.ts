import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessagingService } from './messaging.service';

// Exercise the actual outbound entry point, stopping before message persistence.
// No adapters, provider calls, real accounts or external data are used.
async function formatted(
  settings: Record<string, unknown>,
  workspaceEnabled: boolean,
  content: Record<string, unknown>,
  senderType: 'agent' | 'bot' = 'agent',
  template: string | null = 'Signed {{agent.name}}',
) {
  const stopped = new Error('isolated-before-persistence');
  let lookups = 0;
  const db = {
    effectKey: () => undefined,
    withTenant: async (tenant: string, fn: (c: unknown) => Promise<unknown>) => {
      assert.equal(tenant, 'isolated-company');
      return fn({
        query: async (sql: string, values: unknown[]) => {
          if (sql.includes('AS channel_settings')) {
            lookups++;
            assert.deepEqual(values, ['agent-test', 'conversation-test']);
            assert.match(sql, /cv\.id=\$2/);
            return { rows: [{ signature_enabled: workspaceEnabled, signature_template: template,
              full_name: 'QA Employee', channel_settings: settings }] };
          }
          throw stopped;
        },
      });
    },
  };
  const service = new MessagingService(db as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never, {} as never);
  const request = { tenantId: 'isolated-company', conversationId: 'conversation-test',
    content, senderType, senderUserId: 'agent-test' };
  await assert.rejects(() => service.sendOutbound(request as never), (e) => e === stopped);
  return { content: request.content, lookups };
}

test('activated channel signature overrides workspace enablement without changing the workspace', async () => {
  const channel = { botManagerActive: { sharedInbox: { signatureEnabled: true } } };
  const { content } = await formatted(channel, false, { text: 'Reply' });
  assert.equal(content.text, 'Reply\nSigned QA Employee');
  const disabled = await formatted({ botManagerActive: { sharedInbox: { signatureEnabled: false } } }, true, { text: 'Reply' });
  assert.equal(disabled.content.text, 'Reply');
});

test('draft signature never affects delivery; legacy channels retain workspace policy', async () => {
  const draft = { botManager: { sharedInbox: { signatureEnabled: true } } };
  assert.equal((await formatted(draft, false, { text: 'Reply' })).content.text, 'Reply');
  assert.equal((await formatted({}, true, { text: 'Reply' })).content.text, 'Reply\nSigned QA Employee');
  assert.equal((await formatted({}, false, { text: 'Reply' })).content.text, 'Reply');
});

test('signatures apply to captions but never bot replies or approved templates', async () => {
  const channel = { botManagerActive: { sharedInbox: { signatureEnabled: true } } };
  const media = await formatted(channel, false, { media: { kind: 'image', url: 'https://example.test/image.png', caption: 'Photo' } });
  assert.equal((media.content.media as { caption: string }).caption, 'Photo\nSigned QA Employee');
  assert.equal((await formatted(channel, true, { text: 'Bot' }, 'bot')).lookups, 0);
  assert.equal((await formatted(channel, true, { template: { name: 'approved', language: 'en' } })).lookups, 0);
  assert.equal((await formatted(channel, false, { text: 'Reply' }, 'agent', null)).content.text, 'Reply\n— QA Employee');
});

test('the actual outbound path rejects text overflow after adding a signature', async () => {
  await assert.rejects(() => formatted({ botManagerActive: { sharedInbox: { signatureEnabled: true } } }, false, { text: 'x'.repeat(4096) }), /4096/);
});
