import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Reflector } from '@nestjs/core';
import { ChannelsController } from './channels.controller';
import { ChannelsService, botManagerSettingsSchema } from './channels.service';
import { ROLES_KEY } from '../auth/decorators';

test('bot manager settings are validated, tenant scoped, and preserve legacy channel settings', async () => {
  const original = {
    title: 'Existing widget',
    activeBotFlowId: 'legacy-flow-reference',
    botManager: { general: { noMatchReply: false } },
  };
  let updateValues: unknown[] = [];
  const fakeDb = {
    withTenant: async (tenantId: string, fn: (client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => {
      assert.equal(tenantId, 'tenant-test');
      return fn({ query: async (sql, values = []) => {
        if (sql.startsWith('SELECT settings')) return { rows: [{ settings: original }] };
        updateValues = values;
        const stored = JSON.parse(String(values[1]));
        stored.botManager = JSON.parse(String(values[2]));
        return { rows: [{ settings: stored }] };
      } });
    },
  };
  const service = new ChannelsService(fakeDb as never, {} as never, {} as never);
  const patch = botManagerSettingsSchema.parse({ general: { chatHumanEmail: '', noMatchReply: true } });
  const saved = await service.updateBotSettings('tenant-test', 'channel-test', patch);
  assert.equal(saved.general.noMatchReply, true);
  assert.equal(saved.general.chatHumanEmail, '');
  assert.equal(updateValues[0], 'channel-test');
  assert.deepEqual(JSON.parse(String(updateValues[1])), original);
  assert.throws(() => botManagerSettingsSchema.parse({ general: { chatHumanEmail: 'not-an-email' } }));
  assert.throws(() => botManagerSettingsSchema.parse({ webhook: { incomingMessage: 'yes' } }));
});

test('bot settings read and write routes are restricted to owner and admin', () => {
  const reflector = new Reflector();
  for (const method of ['botSettings', 'updateBotSettings']) {
    assert.deepEqual(reflector.get(ROLES_KEY, ChannelsController.prototype[method as keyof ChannelsController]), ['owner', 'admin']);
  }
});
